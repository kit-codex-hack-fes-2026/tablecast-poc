import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import * as authTables from "../src/db/auth-schema";
import { liveVoice, voiceConfigurationErrors } from "../src/modules/voice/catalog";
import { voicePageSchema } from "../src/schema";
import { fixtureDb } from "./database-fixture";
import { configuration, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const base = "/api/admin/stores/tablecast-store";
function get(path: string, cookie: string) {
  return app.request(path, { headers: { Cookie: cookie } }, env);
}

it.each(["ja", "en"])("%sで外部資格なしにGPT-Live標準音声を選べる", async (locale) => {
  const { cookie } = await setupFixture();
  const provider = vi.spyOn(globalThis, "fetch");
  const response = await get(`${base}/voices?locale=${locale}`, cookie);
  expect(response.status).toBe(200);
  const page = voicePageSchema.parse(await response.json());
  expect(page.voices.map((voice) => voice.voiceId)).toEqual(["marin", "cedar"]);
  expect(page.nextPageToken).toBeNull();
  expect(provider).not.toHaveBeenCalled();
});

it("既存Voice IDはMarinへ接続し、新しく保存する未知のIDは拒否する", async () => {
  const changed = structuredClone(configuration);
  changed.cast.voice.ja = "tablecast-unknown";
  expect(liveVoice(configuration.cast.voice.ja)).toBe("marin");
  expect(liveVoice("cedar")).toBe("cedar");
  expect(await voiceConfigurationErrors(env, changed, configuration)).toEqual([
    {
      code: "VOICE_NOT_FOUND",
      path: ["cast", "voice", "ja"],
      params: { voiceId: "tablecast-unknown" },
    },
  ]);
  changed.cast.voice.ja = "cedar";
  expect(await voiceConfigurationErrors(env, changed, configuration)).toEqual([]);
});

it("未認証端末・別店舗・不正localeや長いカーソルはprovider参照前に拒否する", async () => {
  const { cookie, staff } = await setupFixture();
  const provider = vi.spyOn(globalThis, "fetch");
  const cases = [
    { path: `${base}/voices?locale=ja`, cookie: `tablecast.device=${deviceToken}`, status: 401 },
    { path: "/api/admin/stores/tablecast-other-store/voices?locale=ja", cookie, status: 403 },
    { path: `${base}/voices`, cookie, status: 400 },
    { path: `${base}/voices?locale=fr`, cookie, status: 400 },
    { path: `${base}/voices?locale=ja&locale=en`, cookie, status: 400 },
    { path: `${base}/voices?locale=ja&pageToken=${"x".repeat(2049)}`, cookie, status: 400 },
  ];
  for (const entry of cases)
    expect((await get(entry.path, entry.cookie)).status).toBe(entry.status);
  await fixtureDb.delete(authTables.member).where(eq(authTables.member.userId, staff.userId));
  expect((await get(`${base}/voices?locale=ja`, cookie)).status).toBe(403);
  expect(provider).not.toHaveBeenCalled();
});
