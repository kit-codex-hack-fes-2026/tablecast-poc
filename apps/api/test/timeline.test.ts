import { env, exports } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import app from "../src/app";
import { member } from "../src/db/auth-schema";
import { stores, restaurantTables, tableSessions } from "../src/db/business-schema";
import { getTimeline } from "../src/modules/tables/history";
import { createApiServices } from "../src/platform/context";
import { timelinePageSchema, type TimelinePage } from "../src/schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { configuration, device, deviceToken, setupFixture } from "./fixture";
import { measuredDatabase } from "./measured-database";

const date = "2026-09-01";
const startAt = Date.parse(`${date}T00:00:00+09:00`);
const endAt = startAt + 86_400_000;
const base = "/api/admin/stores/tablecast-store/timeline";
const closed = (id: string, openedAt: number, closedAt: number | null) => ({
  id,
  store_id: device.storeId,
  table_id: "tablecast-table",
  locale: "ja" as const,
  status: "closed" as const,
  guest_count: 2,
  opened_at: openedAt,
  closed_at: closedAt,
});
function request(cookie: string, query = `date=${date}`, path = base) {
  return exports.default.fetch(
    new Request(`http://localhost:3000${path}?${query}`, { headers: { Cookie: cookie } }),
  );
}
async function page(cookie: string, query = `date=${date}`) {
  const response = await request(cookie, query);
  expect(response.status).toBe(200);
  return timelinePageSchema.parse(await response.json());
}

it("日本時間の日境界・日跨ぎ・ゼロ時間を扱い、利用中を未来日へ延ばさない", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb
    .update(tableSessions)
    .set({ opened_at: startAt - 1000 })
    .where(eq(tableSessions.id, staff.tableSessionId));
  await env.TABLECAST_DB.batch(
    [
      closed("tablecast-before", startAt - 2000, startAt),
      closed("tablecast-before-zero", startAt - 1000, startAt - 1000),
      closed("tablecast-long", startAt - 70 * 86_400_000, endAt + 1000),
      closed("tablecast-overlap", startAt - 1000, startAt + 1000),
      closed("tablecast-across", startAt - 1000, endAt + 1000),
      closed("tablecast-midnight", startAt, startAt),
      closed("tablecast-short", startAt + 5000, startAt + 5000),
      closed("tablecast-end", endAt - 1000, endAt),
      closed("tablecast-next", endAt, endAt + 1000),
      closed("tablecast-next-zero", endAt, endAt),
    ].map((row) => insertFixture(tableSessions, row)),
  );
  const result = await page(cookie);
  expect(result).toMatchObject({ date, timeZone: "Asia/Tokyo", startAt, endAt, nextCursor: null });
  expect(result.sessions.map((s) => s.id).toSorted()).toEqual([
    "tablecast-across",
    "tablecast-end",
    "tablecast-long",
    "tablecast-midnight",
    "tablecast-overlap",
    "tablecast-session",
    "tablecast-short",
  ]);
  expect((await page(cookie, "date=2099-01-01")).sessions).toEqual([]);
});

it("同卓・同時刻の来店を欠落なく辿り、ページ取得中の閉卓と新規開卓後も再取得で回復する", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb
    .update(tableSessions)
    .set({ opened_at: startAt + 5000 })
    .where(eq(tableSessions.id, staff.tableSessionId));
  await fixtureDb
    .insert(tableSessions)
    .values(
      Array.from({ length: 6 }, (_, i) =>
        closed(`tablecast-history-${i}`, startAt + 1000, startAt + 2000),
      ),
    );
  let result = await page(cookie, `date=${date}&limit=2`);
  const sessions: TimelinePage["sessions"] = [...result.sessions];
  await fixtureDb
    .update(tableSessions)
    .set({ status: "closed", closed_at: endAt })
    .where(eq(tableSessions.id, staff.tableSessionId));
  await fixtureDb
    .insert(tableSessions)
    .values({ ...closed("tablecast-new", startAt + 6000, null), status: "open" });
  while (result.nextCursor) {
    result = await page(
      cookie,
      new URLSearchParams({
        date,
        limit: "2",
        beforeOpenedAt: String(result.nextCursor.openedAt),
        beforeId: result.nextCursor.id,
      }).toString(),
    );
    sessions.push(...result.sessions);
  }
  expect(sessions).toHaveLength(7);
  expect(new Set(sessions.map((s) => s.id)).size).toBe(7);
  const refreshed = await page(cookie);
  expect(refreshed.sessions).toHaveLength(8);
  expect(refreshed.sessions.find((s) => s.id === staff.tableSessionId)).toMatchObject({
    status: "closed",
    closedAt: endAt,
  });
  expect(refreshed.sessions[0]?.id).toBe("tablecast-new");
});

it("店舗所属・端末Cookie・demoを分離し、所属を失った後の取得を拒否する", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb.insert(stores).values({
    id: "tablecast-other",
    organization_id: "tablecast-fixture-other-org",
    name: "他店",
    config_json: JSON.stringify(configuration),
    updated_at: startAt,
  });
  await fixtureDb
    .insert(restaurantTables)
    .values({ id: "tablecast-other-table", store_id: "tablecast-other", name: "01" });
  await fixtureDb.insert(tableSessions).values([
    closed("tablecast-visible", startAt, startAt + 1000),
    {
      ...closed("tablecast-hidden", startAt, startAt + 1000),
      store_id: "tablecast-other",
      table_id: "tablecast-other-table",
    },
    { ...closed("tablecast-demo", startAt, startAt + 1000), kind: "demo", table_id: null },
  ]);
  expect((await page(cookie)).sessions.map((s) => s.id)).toEqual(["tablecast-visible"]);
  expect(
    (await request(cookie, `date=${date}`, "/api/admin/stores/tablecast-other/timeline")).status,
  ).toBe(403);
  expect((await request("")).status).toBe(401);
  expect((await request(`tablecast.device=${deviceToken}`)).status).toBe(401);
  await expect(
    getTimeline(createApiServices(env), device, { date, limit: 100 }),
  ).rejects.toMatchObject({ code: "STAFF_REQUIRED" });
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.userId, staff.userId));
  expect((await request(cookie)).status).toBe(200);
  await fixtureDb.delete(member).where(eq(member.userId, staff.userId));
  expect((await request(cookie)).status).toBe(403);
});

it("不正な日付・片側cursor・不正limitをHTTP400として扱う", async () => {
  const { cookie } = await setupFixture();
  for (const query of [
    "",
    "date=2026-02-30",
    "date=2025-02-29",
    "date=2026-09-01T00:00:00Z",
    `date=${date}&beforeId=x`,
    `date=${date}&beforeOpenedAt=1000`,
    `date=${date}&beforeOpenedAt=-1&beforeId=x`,
    `date=${date}&beforeOpenedAt=1000&beforeId=%20`,
    ...["0", "201", "1.5", "NaN", ""].map((limit) => `date=${date}&limit=${limit}`),
  ]) {
    expect((await request(cookie, query)).status).toBe(400);
  }
  expect((await request(cookie, "date=2024-02-29")).status).toBe(200);
});

it("閉卓時刻の欠損を架空の利用中表示や来店なしへ置き換えない", async () => {
  const { cookie } = await setupFixture();
  await fixtureDb.insert(tableSessions).values(closed("tablecast-invalid", startAt, null));
  const response = await request(cookie);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "TIMELINE_INVALID_SESSION" } });
});

it("100卓・1万履歴でもページの内容と上限を保ち、認可込みのDB往復が増えない", async ({
  annotate,
}) => {
  const { cookie } = await setupFixture();
  await env.TABLECAST_DB.batch(
    Array.from({ length: 99 }, (_, i) =>
      insertFixture(restaurantTables, {
        id: `tablecast-load-${i}`,
        store_id: device.storeId,
        name: String(i),
      }),
    ),
  );
  let previousRoundtrips: number | undefined;
  for (const count of [100, 10_000]) {
    for (let offset = count === 100 ? 0 : 100; offset < count; offset += 100) {
      await env.TABLECAST_DB.batch(
        Array.from({ length: 100 }, (_, n) => {
          const i = offset + n;
          const openedAt = startAt + 1000 - Math.floor(i / 100) * 86_400_000;
          return insertFixture(tableSessions, {
            ...closed(`tablecast-load-visit-${i}`, openedAt, openedAt + 60_000),
            table_id: i % 100 === 99 ? "tablecast-table" : `tablecast-load-${i % 100}`,
          });
        }),
      );
    }
    for (let sample = 0; sample < 3; sample++) {
      const { database, stats, timing } = measuredDatabase(env.TABLECAST_DB);
      const ctx = createExecutionContext();
      const started = performance.now();
      const response = await app.request(
        `${base}?date=${date}&limit=30`,
        { headers: { Cookie: cookie } },
        { ...env, TABLECAST_DB: database },
        ctx,
      );
      const result = timelinePageSchema.parse(await response.json());
      const elapsedMs = performance.now() - started;
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      expect(result.sessions).toHaveLength(30);
      expect(result.sessions.every((s) => s.openedAt === startAt + 1000)).toBe(true);
      expect(result.nextCursor).not.toBeNull();
      expect(stats.roundtrips).toBeLessThanOrEqual(4);
      previousRoundtrips ??= stats.roundtrips;
      expect(stats.roundtrips).toBe(previousRoundtrips);
      const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
      expect(bytes).toBeLessThan(10_000);
      expect(elapsedMs).toBeLessThan(1000);
      await annotate(
        JSON.stringify({ count, sample, ...stats, ...timing, elapsedMs, bytes }),
        "性能測定",
      );
    }
  }
});

it.for(["before", "after", "both", "both-long"] as const)(
  "前後の履歴が各1万件でも空日・少数来店の読取件数を増やさない: %s",
  async (direction, { annotate }) => {
    const { cookie } = await setupFixture();
    const sparseStart = startAt + 2 * 86_400_000;
    if (direction === "both-long") {
      await fixtureDb
        .insert(tableSessions)
        .values([
          closed("tablecast-long-overlap", startAt - 70 * 86_400_000, sparseStart + 60_000),
          closed("tablecast-long-before", startAt - 80 * 86_400_000, startAt),
        ]);
    }
    await fixtureDb
      .insert(tableSessions)
      .values([
        closed("tablecast-sparse-a", sparseStart + 1000, sparseStart + 60_000),
        closed("tablecast-sparse-b", sparseStart + 120_000, sparseStart + 180_000),
        closed("tablecast-sparse-zero", sparseStart, sparseStart),
      ]);
    for (const count of [100, 10_000]) {
      for (let offset = count === 100 ? 0 : 100; offset < count; offset += 100) {
        await env.TABLECAST_DB.batch(
          Array.from({ length: 100 }, (_, n) => {
            const i = offset + n;
            return (direction.startsWith("both") ? ["before", "after"] : [direction]).map(
              (side) => {
                const openedAt =
                  side === "before"
                    ? startAt - (i + 1) * 60_000
                    : startAt + 4 * 86_400_000 + i * 60_000;
                return insertFixture(
                  tableSessions,
                  closed(`tablecast-${side}-${i}`, openedAt, openedAt + 1000),
                );
              },
            );
          }).flat(),
        );
      }
      for (const selected of ["2026-09-02", "2026-09-03"]) {
        for (let sample = 0; sample < 3; sample++) {
          const { database, stats, timing, batches } = measuredDatabase(env.TABLECAST_DB);
          const ctx = createExecutionContext();
          const started = performance.now();
          const response = await app.request(
            `${base}?date=${selected}`,
            { headers: { Cookie: cookie } },
            { ...env, TABLECAST_DB: database },
            ctx,
          );
          const result = timelinePageSchema.parse(await response.json());
          const elapsedMs = performance.now() - started;
          await waitOnExecutionContext(ctx);
          expect(response.status).toBe(200);
          expect(result.sessions.map((session) => session.id)).toEqual([
            ...(selected === "2026-09-02"
              ? []
              : ["tablecast-sparse-b", "tablecast-sparse-a", "tablecast-sparse-zero"]),
            ...(direction === "both-long" ? ["tablecast-long-overlap"] : []),
          ]);
          expect(result.nextCursor).toBeNull();
          expect(stats.roundtrips).toBeLessThanOrEqual(4);
          const measured = batches.flat();
          expect(measured.length).toBeGreaterThan(0);
          const rowsRead = measured.reduce((sum, query) => sum + query.rowsRead, 0);
          const sqlMs = measured.reduce((sum, query) => sum + query.sqlMs, 0);
          expect(rowsRead).toBeLessThanOrEqual(64);
          expect(elapsedMs).toBeLessThan(1000);
          await annotate(
            JSON.stringify({
              count,
              date: selected,
              direction,
              sample,
              rowsRead,
              sqlMs,
              ...stats,
              ...timing,
              elapsedMs,
            }),
            "空日・少数来店の性能測定",
          );
        }
      }
    }
  },
);

it("同じ日の1万来店の深いcursorでも先頭ページを走査し直さない", async () => {
  const { cookie } = await setupFixture();
  for (let offset = 0; offset < 10_000; offset += 100) {
    await env.TABLECAST_DB.batch(
      Array.from({ length: 100 }, (_, n) =>
        insertFixture(
          tableSessions,
          closed(
            `tablecast-dense-${String(offset + n).padStart(5, "0")}`,
            startAt + 1000,
            startAt + 2000,
          ),
        ),
      ),
    );
  }
  const { database, batches } = measuredDatabase(env.TABLECAST_DB);
  const ctx = createExecutionContext();
  const response = await app.request(
    `${base}?date=${date}&limit=10&beforeOpenedAt=${startAt + 1000}&beforeId=tablecast-dense-00020`,
    { headers: { Cookie: cookie } },
    { ...env, TABLECAST_DB: database },
    ctx,
  );
  expect(response.status).toBe(200);
  const result = timelinePageSchema.parse(await response.json());
  await waitOnExecutionContext(ctx);
  expect(result.sessions.map((session) => session.id)).toEqual(
    Array.from({ length: 10 }, (_, i) => `tablecast-dense-${String(19 - i).padStart(5, "0")}`),
  );
  expect(result.nextCursor).toEqual({ openedAt: startAt + 1000, id: "tablecast-dense-00010" });
  expect(batches.flat().reduce((sum, query) => sum + query.rowsRead, 0)).toBeLessThanOrEqual(64);
});
