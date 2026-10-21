import type { BatchItem } from "drizzle-orm/batch";
import { business, type Database } from "@tablecast/api/db";
import { and, eq, like } from "drizzle-orm";
import type { Owner, SeedEvent, Store } from "./types.ts";
import {
  confirmation,
  event,
  insertSession,
  order,
  payment,
  sampleLine,
  snapshotFor,
  syntheticSpeaker,
  tablecastHistoryBaseTime,
} from "./session.ts";

export async function seedHistory(db: Database, store: Store, owner: Owner) {
  const previous = await db
    .select({ id: business.tableSessions.id })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.store_id, store.id),
        like(business.tableSessions.id, "%-history-%"),
      ),
    );
  const existing = new Set(previous.map((session) => session.id));
  for (let index = 0; index < 200; index++) {
    const sessionId = `${store.id}-history-${index.toString().padStart(3, "0")}`;
    if (existing.has(sessionId)) continue;
    const tableId = `${store.id}-table-${((index % store.tableCount) + 1).toString().padStart(2, "0")}`;
    const openedAt =
      tablecastHistoryBaseTime +
      Math.floor((index * 30) / 200) * 86_400_000 +
      (9 + (index % 8)) * 3_600_000;
    const closedAt = openedAt + 75 * 60_000;
    const locale = index % 3 === 0 ? "en" : "ja";
    const guestCount = 2 + (index % 4);
    const statements: (BatchItem<"sqlite"> | SeedEvent)[] = [
      db.insert(business.tableSessions).values({
        id: sessionId,
        store_id: store.id,
        table_id: tableId,
        locale,
        status: "closed",
        guest_count: guestCount,
        cart_version: 18,
        opened_at: openedAt,
        closed_at: closedAt,
      }),
      event(store.id, sessionId, "table.opened", { guestCount, locale }, openedAt, true),
    ];
    let total = 0;
    for (let number = 0; number < 4; number++) {
      const at = openedAt + (number * 15 + 1) * 60_000;
      const version = number * 4 + 1;
      const line = sampleLine(store.configuration, index + number);
      line.quantity = 1 + ((index + number) % 2);
      const snapshot = snapshotFor(store, sessionId, [line], version, locale, at + 3000);
      total += snapshot.total;
      const orderId = `${snapshot.id}-order`;
      const productName = snapshot.lines[0]?.name[locale] ?? "";
      statements.push(
        event(
          store.id,
          sessionId,
          "voice.user",
          {
            role: "user",
            locale,
            status: "completed",
            speaker: syntheticSpeaker(sessionId, number % guestCount),
            text:
              locale === "ja"
                ? `${productName}について教えてください。`
                : `Could you tell us about ${productName}?`,
          },
          at,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.assistant",
          {
            role: "assistant",
            locale,
            status: "completed",
            text:
              locale === "ja"
                ? "アレルギーや原材料についてはスタッフへご確認ください。"
                : "Please ask a member of staff about ingredients and allergies.",
          },
          at + 1000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "cart.updated",
          { cartVersion: version, lines: [line] },
          at + 2000,
          true,
        ),
        confirmation(db, store.id, snapshot, at + 3000),
        event(
          store.id,
          sessionId,
          "confirmation.prepared",
          { snapshotId: snapshot.id },
          at + 3000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.assistant",
          { role: "assistant", locale, status: "completed", text: snapshot.text },
          at + 4000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.user",
          {
            role: "user",
            locale,
            status: "completed",
            speaker: syntheticSpeaker(sessionId, number === 3 ? null : (number + 1) % guestCount),
            text:
              locale === "ja"
                ? "画面で確認して注文します。"
                : "I will confirm the order on screen.",
          },
          at + 5000,
          true,
        ),
        order(db, store.id, snapshot, "served", at + 6000),
        event(
          store.id,
          sessionId,
          "order.submitted",
          { orderId, total: snapshot.total },
          at + 6000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "order.status",
          { orderId, status: "accepted" },
          at + 10_000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "order.status",
          { orderId, status: "served" },
          at + 16_000,
          true,
        ),
      );
    }
    statements.push(
      payment(db, store.id, sessionId, owner.userId, total, closedAt - 1000),
      event(
        store.id,
        sessionId,
        "billing.payment",
        { amount: total, reason: "合成デモの模擬支払" },
        closedAt - 1000,
        true,
      ),
      event(store.id, sessionId, "table.closed", {}, closedAt, true),
    );
    // 一セッションを一つのD1トランザクションに収め、履歴全体を巨大batchにしない。
    await insertSession(db, statements);
  }
}
