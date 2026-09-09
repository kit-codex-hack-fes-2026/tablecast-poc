import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import * as authTables from "../src/db/auth-schema";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";

const origin = "http://localhost:3000";
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
function upload(
  path: string,
  cookie: string,
  file = new File([png], "tablecast-icon.png", { type: "image/png" }),
) {
  const data = new FormData();
  data.set("image", file);
  return exports.default.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie },
      body: data,
    }),
  );
}
it("店舗管理者が角丸表示用の画像を保存すると組織のlogoと店舗一覧から同じ画像を取得できる", async () => {
  // Given: 店舗管理者とPNG画像。
  const { cookie } = await setupFixture();
  // When: 店舗用の画像をアップロードする。
  const response = await upload("/api/admin/stores/tablecast-store/icon", cookie);
  expect(response.status).toBe(200);
  const organization = await env.TABLECAST_DB.prepare(
    "SELECT logo FROM organization WHERE id='tablecast-org'",
  ).first<{ logo: string }>();
  if (!organization) throw new Error("店舗がありません。");
  // Then: 同じURLが保存され、認証情報なしで画像を描画できる。
  expect(await response.json()).toEqual({ logo: organization.logo });
  const image = await exports.default.fetch(new Request(organization.logo));
  expect(image.headers.get("Content-Type")).toBe("image/png");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
  const stores = await exports.default.fetch(
    new Request(origin + "/api/admin/stores", { headers: { Cookie: cookie } }),
  );
  expect(await stores.json()).toMatchObject({
    stores: [expect.objectContaining({ id: "tablecast-store", logo: organization.logo })],
  });
});
it("店舗画像の変更を未認証・他店舗・通常メンバーへ許可しない", async () => {
  // Given: 所属店舗を持つ管理者。
  const { cookie, staff } = await setupFixture();
  // When / Then: 認証・店舗・役割の境界を越える変更を拒否する。
  expect((await upload("/api/admin/stores/tablecast-store/icon", "")).status).toBe(401);
  expect((await upload("/api/admin/stores/other-store/icon", cookie)).status).toBe(403);
  await fixtureDb
    .update(authTables.member)
    .set({ role: "member" })
    .where(eq(authTables.member.userId, staff.userId));
  expect((await upload("/api/admin/stores/tablecast-store/icon", cookie)).status).toBe(403);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT logo FROM organization WHERE id='tablecast-org'",
    ).first(),
  ).toEqual({ logo: null });
});
it("ユーザーと店舗の画像で形式・容量の共通制約を適用する", async () => {
  // Given: PNGと偽装したテキスト、SVG、上限を超える画像。
  const { cookie } = await setupFixture();
  for (const file of [
    new File(["not an image"], "tablecast.png", { type: "image/png" }),
    new File(["<svg/>"], "tablecast.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(1024 * 1024 + 1)], "tablecast.png", { type: "image/png" }),
  ]) {
    // When / Then: どちらのアップロードでも拒否する。
    for (const path of ["/api/account/avatar", "/api/admin/stores/tablecast-store/icon"])
      expect((await upload(path, cookie, file)).status).toBe(422);
  }
  expect((await upload("/api/account/avatar", cookie)).status).toBe(200);
});
