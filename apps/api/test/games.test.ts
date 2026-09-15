import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApiServices } from "../src/platform/context";
import {
  gamePlugins,
  gameRuns,
  gameVersions,
  tableSessions,
  restaurantTables,
} from "../src/db/business-schema";
import { gamePackageSchema, gameStateSchema } from "../src/modules/games/model";
import {
  confirmGamePreview,
  disableGame,
  endGame,
  previewGame,
  publishGame,
  registerGame,
  saveGameState,
  startGame,
  validateGame,
} from "../src/modules/games/service";
import { getGame, getGameRun, getGameVersion, listTableGames } from "../src/modules/games/queries";
import { createDemo, resetDemo } from "../src/modules/demo/service";
import { updateCart } from "../src/modules/orders/service";
import { device, deviceToken, setupFixture } from "./fixture";

const services = () => createApiServices(env);
const gamePackage = gamePackageSchema.parse({
  manifest: {
    apiVersion: 1,
    name: { ja: "卓上ゲーム", en: "Table game" },
    description: { ja: "対戦", en: "Match" },
    rules: { ja: "交代して遊ぶ", en: "Take turns" },
    minPlayers: 2,
    maxPlayers: 6,
    capabilities: ["state"],
  },
  html: '<button id="finish">終了</button>',
  css: "button { min-height: 48px; }",
  javascript: 'document.getElementById("finish").onclick = () => tablecast.exit();',
});

it("未検証・未試遊・MCP承認を拒否し、人間が確認した版だけ卓へ公開する", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const { versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: gamePackage,
  });
  const approval = { versionId, expectedRevision: 0, approved: true as const };
  expect((await listTableGames(api, device)).games).toEqual([]);
  await expect(previewGame(api, staff, "tablecast-dice", versionId)).rejects.toMatchObject({
    code: "GAME_NOT_VALIDATED",
  });
  await validateGame(api, staff, "tablecast-dice", versionId);
  await expect(publishGame(api, staff, "tablecast-dice", approval)).rejects.toMatchObject({
    code: "GAME_PREVIEW_REQUIRED",
  });
  await expect(
    confirmGamePreview(api, { ...staff, kind: "mcp", canWrite: true }, "tablecast-dice", versionId),
  ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
  await confirmGamePreview(api, staff, "tablecast-dice", versionId);
  await expect(
    publishGame(api, { ...staff, kind: "mcp", canWrite: true }, "tablecast-dice", approval),
  ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
  await publishGame(api, staff, "tablecast-dice", approval);
  expect((await listTableGames(api, device)).games[0]).toMatchObject({
    id: "tablecast-dice",
    versionId,
  });
});

it("別店舗と読取専用MCPはゲームの取得・更新・公開を行えない", async () => {
  const { staff } = await setupFixture();
  const api = services();
  await expect(
    registerGame(
      api,
      { ...staff, kind: "mcp", canWrite: false },
      { gameId: "tablecast-dice", package: gamePackage },
    ),
  ).rejects.toMatchObject({ code: "WRITE_SCOPE_REQUIRED" });
  await expect(
    registerGame(
      api,
      { ...staff, role: "member" },
      { gameId: "tablecast-dice", package: gamePackage },
    ),
  ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  const { versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: gamePackage,
  });
  const other = { ...staff, storeId: "tablecast-other" };
  await expect(getGameVersion(api, other, "tablecast-dice", versionId)).rejects.toMatchObject({
    code: "GAME_NOT_FOUND",
  });
  await expect(getGame(api, other, "tablecast-dice")).rejects.toMatchObject({
    code: "GAME_NOT_FOUND",
  });
  await expect(validateGame(api, other, "tablecast-dice", versionId)).rejects.toMatchObject({
    code: "GAME_NOT_FOUND",
  });
});

it("新版登録と公開後もプレイ中の版を固定し、停止・再公開で古いプレイを復活させない", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const first = await registerGame(api, staff, { gameId: "tablecast-dice", package: gamePackage });
  await validateGame(api, staff, first.gameId, first.versionId);
  await confirmGamePreview(api, staff, first.gameId, first.versionId);
  await publishGame(api, staff, first.gameId, {
    versionId: first.versionId,
    expectedRevision: 0,
    approved: true,
  });
  const run = await startGame(api, device, first.gameId);
  await saveGameState(api, device, run.id, {
    expectedVersion: 0,
    state: { turn: 2, score: [3, 5] },
  });
  expect(await getGameRun(api, device, run.id)).toMatchObject({
    versionId: first.versionId,
    revision: 1,
    state: { turn: 2, score: [3, 5] },
  });
  await expect(
    saveGameState(api, device, run.id, { expectedVersion: 0, state: { turn: 1 } }),
  ).rejects.toMatchObject({ code: "GAME_CONFLICT" });
  const second = await registerGame(api, staff, {
    gameId: first.gameId,
    package: { ...gamePackage, javascript: "void 0;" },
  });
  expect((await getGame(api, staff, first.gameId)).activeVersionId).toBe(first.versionId);
  await validateGame(api, staff, first.gameId, second.versionId);
  await confirmGamePreview(api, staff, first.gameId, second.versionId);
  await publishGame(api, staff, first.gameId, {
    versionId: second.versionId,
    expectedRevision: 1,
    approved: true,
  });
  expect((await getGameRun(api, device, run.id)).versionId).toBe(first.versionId);
  await disableGame(api, staff, first.gameId, 2);
  expect((await listTableGames(api, device)).games).toEqual([]);
  await expect(
    saveGameState(api, device, run.id, { expectedVersion: 1, state: {} }),
  ).rejects.toMatchObject({ code: "GAME_UNAVAILABLE" });
  await publishGame(api, staff, first.gameId, {
    versionId: first.versionId,
    expectedRevision: 3,
    approved: true,
  });
  await expect(getGameRun(api, device, run.id)).rejects.toMatchObject({ code: "GAME_UNAVAILABLE" });
});

it("古い公開要求と停止要求は公開者・公開版・プレイ状態を変更しない", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const { gameId, versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: gamePackage,
  });
  await validateGame(api, staff, gameId, versionId);
  await confirmGamePreview(api, staff, gameId, versionId);
  await publishGame(api, staff, gameId, { versionId, expectedRevision: 0, approved: true });
  const run = await startGame(api, device, gameId);
  await expect(
    publishGame(api, { ...staff, userId: "other-manager" }, gameId, {
      versionId,
      expectedRevision: 0,
      approved: true,
    }),
  ).rejects.toMatchObject({ code: "GAME_CONFLICT" });
  expect(
    (await api.db.select().from(gameVersions).where(eq(gameVersions.id, versionId)).get())
      ?.published_by,
  ).toBe(staff.userId);
  await expect(disableGame(api, staff, gameId, 0)).rejects.toMatchObject({ code: "GAME_CONFLICT" });
  expect((await getGameRun(api, device, run.id)).id).toBe(run.id);
});

it("ゲーム終了はカート・卓の注文画面を変更しない", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const lines = [{ id: "tablecast-cart-line", productId: "tea", quantity: 2, selections: [] }];
  await updateCart(api, device, { expectedVersion: 0, lines });
  const before = await api.db
    .select()
    .from(tableSessions)
    .where(eq(tableSessions.id, device.tableSessionId))
    .get();
  const { gameId, versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: gamePackage,
  });
  await validateGame(api, staff, gameId, versionId);
  await confirmGamePreview(api, staff, gameId, versionId);
  await publishGame(api, staff, gameId, { versionId, expectedRevision: 0, approved: true });
  if (!before) throw new Error("卓fixtureがありません");
  expect(JSON.parse(before.cart_json)).toEqual(lines);
  const run = await startGame(api, device, gameId);
  await endGame(api, device, run.id);
  expect(
    await api.db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, device.tableSessionId))
      .get(),
  ).toEqual(before);
  expect(
    (await api.db.select().from(gameRuns).where(eq(gameRuns.id, run.id)).get())?.ended_at,
  ).not.toBeNull();
  await expect(getGameRun(api, device, run.id)).rejects.toMatchObject({ code: "GAME_UNAVAILABLE" });
});

it("HTTP入口で不正パッケージと他店舗要求を拒否し、ゲーム資産を公開画像経路へ流さない", async () => {
  const { cookie } = await setupFixture();
  const origin = "http://localhost:3000";
  const response = await exports.default.fetch(
    new Request(`${origin}/api/admin/stores/tablecast-store/games`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: "tablecast-dice",
        package: {
          ...gamePackage,
          manifest: { ...gamePackage.manifest, capabilities: ["orders"] },
        },
      }),
    }),
  );
  expect(response.status).toBe(422);
  expect(await services().db.select().from(gamePlugins)).toEqual([]);
  const forbidden = await exports.default.fetch(
    new Request(`${origin}/api/admin/stores/other-store/games`, { headers: { Cookie: cookie } }),
  );
  expect(forbidden.status).toBe(403);
  const guest = await exports.default.fetch(
    new Request(`${origin}/api/admin/stores/tablecast-store/games`, {
      headers: { Cookie: `tablecast.device=${deviceToken}` },
    }),
  );
  expect(guest.status).toBe(401);
  const hidden = await exports.default.fetch(
    new Request(`${origin}/media/tablecast/games/tablecast-store/source.json`),
  );
  expect(hidden.status).toBe(404);
});

it("state未宣言のゲームは卓HTTP APIで保存できず、状態と版を維持する", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const { gameId, versionId } = await registerGame(api, staff, {
    gameId: "tablecast-no-state",
    package: { ...gamePackage, manifest: { ...gamePackage.manifest, capabilities: [] } },
  });
  await validateGame(api, staff, gameId, versionId);
  await confirmGamePreview(api, staff, gameId, versionId);
  await publishGame(api, staff, gameId, { versionId, expectedRevision: 0, approved: true });
  const run = await startGame(api, device, gameId);
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/table/games/runs/${run.id}/state`, {
      method: "PUT",
      headers: {
        Cookie: `tablecast.device=${deviceToken}`,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: 0, state: { score: 99 } }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await getGameRun(api, device, run.id)).toMatchObject({ state: {}, revision: 0 });
});

it("同じ店舗の別卓はプレイを読取・保存・終了できない", async () => {
  const { staff } = await setupFixture();
  const api = services();
  await api.db
    .insert(restaurantTables)
    .values({ id: "tablecast-other-table", store_id: device.storeId, name: "02" });
  await api.db.insert(tableSessions).values({
    id: "tablecast-other-session",
    table_id: "tablecast-other-table",
    store_id: device.storeId,
    locale: "ja",
    guest_count: 2,
    opened_at: Date.now(),
  });
  const other = { ...device, tableSessionId: "tablecast-other-session" };
  const { gameId, versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: gamePackage,
  });
  await validateGame(api, staff, gameId, versionId);
  await confirmGamePreview(api, staff, gameId, versionId);
  await publishGame(api, staff, gameId, { versionId, expectedRevision: 0, approved: true });
  const run = await startGame(api, device, gameId);
  await expect(getGameRun(api, other, run.id)).rejects.toMatchObject({ code: "GAME_UNAVAILABLE" });
  await expect(
    saveGameState(api, other, run.id, { expectedVersion: 0, state: { score: 99 } }),
  ).rejects.toMatchObject({ code: "GAME_UNAVAILABLE" });
  await endGame(api, other, run.id);
  expect(await getGameRun(api, device, run.id)).toMatchObject({ state: {}, revision: 0 });
});

it("参加人数の両端では開始でき、範囲外と閉卓では開始できない", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const { gameId, versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: gamePackage,
  });
  await validateGame(api, staff, gameId, versionId);
  await confirmGamePreview(api, staff, gameId, versionId);
  await publishGame(api, staff, gameId, { versionId, expectedRevision: 0, approved: true });
  for (const players of [2, 6]) {
    await api.db
      .update(tableSessions)
      .set({ guest_count: players })
      .where(eq(tableSessions.id, device.tableSessionId));
    expect(await startGame(api, device, gameId)).toMatchObject({ players });
  }
  for (const players of [1, 7]) {
    await api.db
      .update(tableSessions)
      .set({ guest_count: players })
      .where(eq(tableSessions.id, device.tableSessionId));
    await expect(startGame(api, device, gameId)).rejects.toMatchObject({
      code: "GAME_PLAYER_COUNT",
    });
  }
  expect(await api.db.select().from(gameRuns)).toHaveLength(2);
  await api.db
    .update(tableSessions)
    .set({ status: "closed", guest_count: 2 })
    .where(eq(tableSessions.id, device.tableSessionId));
  await expect(startGame(api, device, gameId)).rejects.toMatchObject({ code: "SESSION_CLOSED" });
  await expect(listTableGames(api, device)).rejects.toMatchObject({ code: "SESSION_CLOSED" });
});

it("日本語を含むパッケージと保存状態を文字数ではなくUTF-8バイト数で制限する", () => {
  const empty = { ...gamePackage, javascript: "" };
  const remaining = 2_000_000 - new TextEncoder().encode(JSON.stringify(empty)).length;
  const javascript = "あ".repeat(Math.floor(remaining / 3)) + "x".repeat(remaining % 3);
  expect(gamePackageSchema.safeParse({ ...empty, javascript }).success).toBe(true);
  expect(gamePackageSchema.safeParse({ ...empty, javascript: javascript + "x" }).success).toBe(
    false,
  );
  const state = { text: "あ".repeat(5457) + "xx" };
  expect(new TextEncoder().encode(JSON.stringify(state)).length).toBe(16_384);
  expect(gameStateSchema.safeParse(state).success).toBe(true);
  expect(gameStateSchema.safeParse({ text: state.text + "x" }).success).toBe(false);
});

it("デモのリセットはそのデモのゲーム状態だけを破棄し、実卓と公開版を保持する", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const { gameId, versionId } = await registerGame(api, staff, {
    gameId: "tablecast-dice",
    package: { ...gamePackage, manifest: { ...gamePackage.manifest, minPlayers: 1 } },
  });
  await validateGame(api, staff, gameId, versionId);
  await confirmGamePreview(api, staff, gameId, versionId);
  await publishGame(api, staff, gameId, { versionId, expectedRevision: 0, approved: true });
  const demo = await createDemo(api, staff);
  const actor = { ...staff, tableSessionId: demo.id, demoId: demo.id };
  const demoRun = await startGame(api, actor, gameId);
  const tableRun = await startGame(api, device, gameId);
  await resetDemo(api, actor, demo.version);
  await expect(getGameRun(api, actor, demoRun.id)).rejects.toMatchObject({
    code: "GAME_UNAVAILABLE",
  });
  expect((await getGameRun(api, device, tableRun.id)).versionId).toBe(versionId);
  expect((await getGame(api, staff, gameId)).activeVersionId).toBe(versionId);
});

it("公開ゲーム一覧は50件ずつ返し、続きから重複せずに取得できる", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const ids = Array.from(
    { length: 51 },
    (_, index) => `tablecast-game-${String(index).padStart(2, "0")}`,
  );
  // D1の1文あたりのbind上限内で、ページ上限を超えるfixtureを投入する。
  for (let offset = 0; offset < ids.length; offset += 8) {
    const page = ids.slice(offset, offset + 8);
    await api.db.batch([
      api.db
        .insert(gamePlugins)
        .values(page.map((id) => ({ store_id: device.storeId, id, active_version_id: id }))),
      api.db.insert(gameVersions).values(
        page.map((id) => ({
          id,
          store_id: device.storeId,
          game_id: id,
          manifest_json: JSON.stringify(gamePackage.manifest),
          package_key: `tablecast/games/${id}.json`,
          status: "ready" as const,
          published_by: staff.userId,
          created_at: Date.now(),
        })),
      ),
    ]);
  }
  const first = await listTableGames(api, device);
  expect(first.games.map((game) => game.id)).toEqual(ids.slice(0, 50));
  expect(first.next).toBe(ids[49]);
  const last = await listTableGames(api, device, first.next ?? "");
  expect(last.games.map((game) => game.id)).toEqual([ids[50]]);
  expect(last.next).toBeNull();
});

it("20版を超えても履歴から古い公開版を取得して復帰できる", async () => {
  const { staff } = await setupFixture();
  const api = services();
  const first = await registerGame(api, staff, {
    gameId: "tablecast-history",
    package: gamePackage,
  });
  await validateGame(api, staff, first.gameId, first.versionId);
  await confirmGamePreview(api, staff, first.gameId, first.versionId);
  await publishGame(api, staff, first.gameId, {
    versionId: first.versionId,
    expectedRevision: 0,
    approved: true,
  });
  await api.db
    .update(gameVersions)
    .set({ created_at: 0 })
    .where(eq(gameVersions.id, first.versionId));
  for (let index = 0; index < 20; index++)
    await registerGame(api, staff, { gameId: first.gameId, package: gamePackage });
  const recent = await getGame(api, staff, first.gameId);
  expect(recent.versions).toHaveLength(20);
  expect(recent.versions.some((version) => version.id === first.versionId)).toBe(false);
  const older = await getGame(api, staff, first.gameId, recent.nextBefore ?? undefined);
  expect(older.versions.map((version) => version.id)).toEqual([first.versionId]);
  expect(older.nextBefore).toBeNull();
  await disableGame(api, staff, first.gameId, 1);
  const version = older.versions[0];
  if (!version) throw new Error("以前の版が見つかりません");
  const restored = await publishGame(api, staff, first.gameId, {
    versionId: version.id,
    expectedRevision: 2,
    approved: true,
  });
  expect(restored.activeVersionId).toBe(first.versionId);
});
