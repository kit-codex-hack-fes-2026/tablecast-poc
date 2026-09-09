import { abortAllDurableObjects } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { resetFixtureStorage, setupFixture } from "./fixture";

it("停止したD1のfixtureを次の試験へ残さない", async () => {
  // Given: 店舗データを作成したD1のインスタンスが終了している。
  await setupFixture();
  await abortAllDurableObjects();
  // When: 次の試験に向けてストレージを初期化する。
  await resetFixtureStorage();
  // Then: 前の試験のテーブルを残さずmigrationから再作成できる。
  const tables = await env.TABLECAST_DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='organization'",
  ).all();
  expect(tables.results).toEqual([]);
});
