import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  adminStateSchema,
  catalogSchema,
  tableStateSchema,
  snapshotSchema,
  orderSchema,
} from "../apps/api/src/schema";
import { demoCredentials, sampleLine } from "./tablecast-seed";
import { readRuntime } from "./tablecast-runtime";

// 焦点のT01とブラウザー試験用T12には触れず、背景のT02だけで注文する。
async function main() {
  if (process.argv.length > 2)
    throw new Error("demo:playは引数なしで、このworktreeの背景卓を一段階だけ進めます。");
  const runtime = await readRuntime();
  const credentials = await demoCredentials();
  const origin = new URL(runtime.origin);
  async function request(path: string, cookie = "", body?: unknown, method = "POST") {
    const response = await fetch(`http://127.0.0.1:${runtime.ports.web}${path}`, {
      method: body === undefined ? "GET" : method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin.origin,
        Host: origin.host,
        Cookie: cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`背景進行に失敗しました: ${path} (${response.status})`);
    return response;
  }
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  let advanced = 0;
  for (const account of [
    { email: credentials.email, password: credentials.password },
    { email: credentials.otherEmail, password: credentials.otherPassword },
  ]) {
    const login = await request("/api/auth/sign-in/email", "", account);
    const staffCookie = cookieOf(login);
    if (!staffCookie) throw new Error("デモ管理者の認証が成立していません。");
    const stores = z
      .object({ stores: z.array(z.object({ id: z.string() })) })
      .parse(await (await request("/api/admin/stores", staffCookie)).json());
    for (const store of stores.stores) {
      const adminPath = `/api/admin/stores/${store.id}`;
      const state = adminStateSchema.parse(await (await request(adminPath, staffCookie)).json());
      const background = state.tables.filter(
        (table) => table.tableName !== "T01" && table.tableName !== "T12",
      );
      // 既存注文を一段階ずつ進める。会計済みや終了済みの注文には加算しない。
      for (const table of background) {
        for (const order of table.orders) {
          if (order.status === "submitted" || order.status === "accepted") {
            await request(`${adminPath}/orders/${order.id}/status`, staffCookie, {
              status: order.status === "submitted" ? "accepted" : "served",
            });
            advanced++;
          }
        }
        if (table.staffCalled) {
          await request(`${adminPath}/tables/${table.id}/call/resolve`, staffCookie, {});
          advanced++;
        }
      }
      const target = background.find((table) => table.tableName === "T02");
      if (!target || target.orders.length) continue;
      const code = z
        .object({ device_code: z.string(), user_code: z.string(), interval: z.number().optional() })
        .parse(await (await request("/api/devices/request", "", {})).json());
      await request(`${adminPath}/devices/approve`, staffCookie, {
        userCode: code.user_code,
        tableId: target.tableId,
      });
      await Bun.sleep((code.interval ?? 5) * 1000);
      const paired = await request("/api/devices/poll", "", { device_code: code.device_code });
      const deviceCookie = cookieOf(paired);
      if (!deviceCookie) throw new Error("背景卓の端末接続が成立していません。");
      const current = tableStateSchema.parse(
        await (await request("/api/table", deviceCookie)).json(),
      );
      const catalog = catalogSchema.parse(
        await (await request("/api/table/catalog", deviceCookie)).json(),
      );
      const cart = await request(
        "/api/table/cart",
        deviceCookie,
        { expectedVersion: current.cart.version, lines: [sampleLine(catalog.configuration)] },
        "PUT",
      );
      const updated = tableStateSchema.parse(await cart.json());
      const snapshot = snapshotSchema.parse(
        await (
          await request("/api/table/confirm", deviceCookie, {
            expectedVersion: updated.cart.version,
            channel: "gui",
          })
        ).json(),
      );
      const order = orderSchema.parse(
        await (
          await request("/api/table/orders", deviceCookie, {
            snapshotId: snapshot.id,
            idempotencyKey: `tablecast-demo-${randomUUID()}`,
            approved: true,
          })
        ).json(),
      );
      if (order.tableSessionId !== target.id) throw new Error("背景卓の注文先が一致しません。");
      advanced++;
    }
  }
  console.info(
    `TableCastの背景卓を${advanced}操作進めました。T01・T12は実操作用に維持しています。`,
  );
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "背景卓の進行に失敗しました。");
  process.exitCode = 1;
});
