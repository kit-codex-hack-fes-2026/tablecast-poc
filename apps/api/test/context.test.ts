import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { staffActor, staffIdentity } from "../src/modules/auth/middleware";
import { requestServices, type ApiEnv, type ApiServices } from "../src/platform/context";
import { handleError } from "../src/platform/http";
import { setupFixture } from "./fixture";

it("ログイン済みの要求で認証と店舗認可を重ねてもsession照会は一度だけ行い、次の要求へ持ち越さない", async () => {
  // Given: 実DBのスタッフsessionと、そのsessionを重ねて参照するHTTP経路。
  const { cookie, staff } = await setupFixture();
  const requests: ApiServices[] = [];
  const sessionReads: number[] = [];
  const app = new Hono<ApiEnv>()
    .use("*", requestServices)
    .use("*", async (c, next) => {
      const services = c.get("services");
      requests.push(services);
      const read = vi.spyOn(services.auth.api, "getSession");
      await next();
      sessionReads.push(read.mock.calls.length);
      read.mockRestore();
    })
    .onError(handleError)
    .get("/staff", async (c) => {
      const [first, second] = await Promise.all([staffIdentity(c), staffIdentity(c)]);
      const actor = await staffActor(c, staff.storeId);
      return c.json({ first: first.user.id, second: second.user.id, actor: actor.userId });
    });

  // When: Cookie付きの要求を処理した後、Cookieなしで同じ経路へアクセスする。
  const authenticated = await app.request("/staff", { headers: { Cookie: cookie } }, env);
  const anonymous = await app.request("/staff", {}, env);

  // Then: 同一要求は一回の照会を共有し、次の要求は前の認証・依存を再利用しない。
  expect(authenticated.status).toBe(200);
  expect(await authenticated.json()).toEqual({
    first: staff.userId,
    second: staff.userId,
    actor: staff.userId,
  });
  expect(anonymous.status).toBe(401);
  expect(sessionReads).toEqual([1, 1]);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.db).not.toBe(requests[1]?.db);
  expect(requests[0]?.auth).not.toBe(requests[1]?.auth);
});

it("認証設定のない環境でも公開経路はDBを利用でき、必要になるまでAuthを生成しない", async () => {
  // Given: Authのsecretを持たない公開経路。
  const app = new Hono<ApiEnv>().use("*", requestServices).get("/public", async (c) => {
    const result = await c.get("services").db.run("SELECT 1");
    return c.json({ ok: result.success });
  });

  // When: Authを利用しないHTTP要求を処理する。
  const response = await app.request("/public", {}, { ...env, TABLECAST_AUTH_SECRET: "" });

  // Then: 無関係な認証設定が公開処理を停止させない。
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
