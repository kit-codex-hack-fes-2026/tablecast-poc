import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import {
  createDraft,
  getDraft,
  publishDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration";
import { getCatalog } from "../src/modules/operations";
import { configDraftSchema, voicePageSchema } from "../src/schema";
import { deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const base = "/api/admin/stores/tablecast-store";
const secret = "tablecast-private-voice-metadata-key";
const privateBody = "tablecast-private-provider-details";
const configured = () => ({ ...env, TABLECAST_INWORLD_VOICES_API_KEY: secret });
const metadata = (voiceId = "tablecast-system-ja", langCode = "JA_JP", source = "SYSTEM") => ({
  voiceId,
  displayName: "標準音声",
  langCode,
  source,
  description: privateBody,
});
function get(path: string, cookie: string, bindings = configured()) {
  return app.request(path, { headers: { Cookie: cookie } }, bindings);
}
async function changedDraft(voiceId = "tablecast-system-ja") {
  const fixture = await setupFixture();
  const created = await createDraft(env, fixture.staff);
  const configuration = structuredClone(created.configuration);
  configuration.cast.voice.ja = voiceId;
  return {
    ...fixture,
    draft: await updateDraft(env, fixture.staff, created.id, {
      expectedVersion: created.version,
      configuration,
    }),
  };
}

it("一覧を標準音声と主言語に絞って重複を除き、opaqueカーソルを固定originへそのまま渡す", async () => {
  const { cookie } = await setupFixture();
  const pageToken = "tablecast-next+/=?&filter=source-IVC";
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin + url.pathname).toBe("https://api.inworld.ai/voices/v1/voices");
    expect(url.searchParams.get("filter")).toBe('source = "SYSTEM" AND lang_code = "ja"');
    expect(url.searchParams.get("orderBy")).toBe("display_name asc");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Basic ${secret}`);
    expect(new Request(url, init).redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect([null, pageToken]).toContain(url.searchParams.get("pageToken"));
    if (url.searchParams.has("pageToken")) {
      return Response.json({ voices: [metadata("tablecast-system-ja-next")], nextPageToken: "" });
    }
    return Response.json({
      voices: [
        metadata(),
        metadata(),
        metadata("tablecast-custom", "JA_JP", "IVC"),
        metadata("tablecast-foreign", "EN_US"),
        metadata("tablecast-community", "JA_JP", "COMMUNITY"),
      ],
      nextPageToken: pageToken,
    });
  });

  const first = await get(`${base}/voices?locale=ja`, cookie);
  const firstPage = voicePageSchema.parse(await first.json());
  const second = await get(
    `${base}/voices?${new URLSearchParams({ locale: "ja", pageToken }).toString()}`,
    cookie,
  );
  const secondPage = voicePageSchema.parse(await second.json());

  expect(first.status).toBe(200);
  expect(firstPage).toEqual({
    voices: [{ voiceId: "tablecast-system-ja", displayName: "標準音声", langCode: "JA_JP" }],
    nextPageToken: pageToken,
  });
  expect(secondPage.nextPageToken).toBeNull();
  expect(secondPage.voices[0]?.voiceId).toBe("tablecast-system-ja-next");
  expect(JSON.stringify(firstPage)).not.toContain(privateBody);
  expect(JSON.stringify(firstPage)).not.toContain(secret);
  expect(provider).toHaveBeenCalledTimes(2);
});

it("未認証端末・別店舗・不正localeや長いカーソルはprovider呼出し前に拒否する", async () => {
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
  await env.TABLECAST_DB.prepare("DELETE FROM member WHERE user_id=?").bind(staff.userId).run();
  expect((await get(`${base}/voices?locale=ja`, cookie)).status).toBe(403);
  expect(provider).not.toHaveBeenCalled();
});

it("音声一覧用secretが未設定なら503を返しSTT/TTSやモデル資格で代用しない", async () => {
  const { cookie } = await setupFixture();
  const provider = vi.spyOn(globalThis, "fetch");
  const response = await get(`${base}/voices?locale=en`, cookie, {
    ...env,
    TABLECAST_INWORLD_VOICES_API_KEY: "",
    TABLECAST_MODEL_API_KEY: secret,
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "VOICE_CATALOG_NOT_CONFIGURED" } });
  expect(provider).not.toHaveBeenCalled();
});

it.each([
  "認証失敗",
  "一時障害",
  "redirect",
  "不正JSON",
  "不正schema",
  "過大応答",
  "過大cursor",
  "通信例外",
])("providerの%sを秘密本文のない503へ揃える", async (scenario) => {
  const { cookie } = await setupFixture();
  const logger = vi.spyOn(console, "error");
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (scenario === "通信例外") throw new Error(`${secret}: ${privateBody}`);
    if (scenario === "認証失敗" || scenario === "一時障害")
      return new Response(`${secret}: ${privateBody}`, {
        status: scenario === "認証失敗" ? 401 : 500,
      });
    if (scenario === "redirect")
      return new Response(privateBody, {
        status: 302,
        headers: { Location: "https://example.invalid/private" },
      });
    if (scenario === "不正JSON") return new Response(privateBody);
    if (scenario === "不正schema") return Response.json({ voices: [{ voiceId: secret }] });
    if (scenario === "過大cursor")
      return Response.json({ voices: [], nextPageToken: "x".repeat(2049) });
    return Response.json({ voices: [], description: "x".repeat(256 * 1024) });
  });
  const response = await get(`${base}/voices?locale=ja`, cookie);
  const result: unknown = await response.json();
  expect(response.status).toBe(503);
  expect(result).toMatchObject({
    error: { code: "VOICE_CATALOG_UNAVAILABLE", message: "VOICE_CATALOG_UNAVAILABLE" },
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain(privateBody);
  expect(logger).not.toHaveBeenCalled();
  expect(provider).toHaveBeenCalledTimes(1);
  const call = provider.mock.calls[0];
  if (!call) throw new Error("providerへの要求がありません");
  const [input, init] = call;
  const sent = new Request(input instanceof Request ? input : input.toString(), init);
  expect(sent.redirect).toBe("manual");
  expect(new URL(sent.url).origin).toBe("https://api.inworld.ai");
});

it("音声一覧は5秒の期限を指定し、中止された要求を503へ変換する", async () => {
  const { cookie } = await setupFixture();
  const controller = new AbortController();
  const deadline = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const reached = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        reached.resolve();
        init?.signal?.addEventListener(
          "abort",
          () => {
            aborted.resolve();
            reject(new Error(privateBody));
          },
          { once: true },
        );
      }),
  );
  const pending = get(`${base}/voices?locale=ja`, cookie);
  try {
    await reached.promise;
    expect(deadline).toHaveBeenCalledWith(5000);
  } finally {
    controller.abort();
  }
  const response = await pending;
  await aborted.promise;
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "VOICE_CATALOG_UNAVAILABLE" } });
});

it.each([
  {
    name: "不在",
    source: "SYSTEM",
    langCode: "JA_JP",
    exists: false,
    code: "VOICE_NOT_FOUND",
    params: { voiceId: "tablecast-system-ja" },
  },
  {
    name: "SYSTEM条件に反する独自音声の応答",
    source: "IVC",
    langCode: "JA_JP",
    exists: true,
    code: "VOICE_NOT_STANDARD",
    params: { voiceId: "tablecast-system-ja" },
  },
  {
    name: "主言語不一致",
    source: "SYSTEM",
    langCode: "EN_US",
    exists: true,
    code: "VOICE_LANGUAGE_MISMATCH",
    params: { voiceId: "tablecast-system-ja", locale: "ja", langCode: "EN_US" },
  },
])(
  "変更した音声が$nameなら構造化エラーを保存しreadyにしない",
  async ({ source, langCode, exists, code, params }) => {
    const { staff, draft } = await changedDraft();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        voices: exists ? [metadata("tablecast-system-ja", langCode, source)] : [],
        nextPageToken: "",
      }),
    );
    const result = await validateDraft(configured(), staff, draft.id, draft.version);
    expect(result.status).toBe("draft");
    expect(result.errors).toEqual([{ code, path: ["cast", "voice", "ja"], params }]);
  },
);

it("検証時の一時障害は下書きの状態・版・既存エラーを変更しない", async () => {
  const { staff, draft } = await changedDraft();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(privateBody, { status: 503 }));
  const before = await getDraft(env, staff, draft.id);
  await expect(validateDraft(configured(), staff, draft.id, draft.version)).rejects.toMatchObject({
    code: "VOICE_CATALOG_UNAVAILABLE",
    status: 503,
  });
  expect(await getDraft(env, staff, draft.id)).toEqual(before);
});

it("公開時にも標準音声一覧を再確認し、成功済みの同じ公開要求ではproviderを再照会しない", async () => {
  const { staff, cookie, draft } = await changedDraft("Asuka");
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin + url.pathname).toBe("https://api.inworld.ai/voices/v1/voices");
    expect(url.searchParams.get("filter")).toBe('source = "SYSTEM"');
    return Response.json({ voices: [metadata("Asuka")], totalSize: 1, nextPageToken: "" });
  });
  await validateDraft(configured(), staff, draft.id, draft.version);
  const payload = {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-voice-publication",
    approved: true,
  };
  const publish = () =>
    app.request(
      `${base}/drafts/${draft.id}/publish`,
      {
        method: "POST",
        headers: { Cookie: cookie, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      configured(),
    );
  provider.mockResolvedValueOnce(Response.json({ voices: [], nextPageToken: "" }));
  const rejected = await publish();
  expect(rejected.status).toBe(422);
  expect(await rejected.json()).toMatchObject({
    error: {
      code: "DRAFT_INVALID",
      details: [
        {
          code: "VOICE_NOT_FOUND",
          path: ["cast", "voice", "ja"],
          params: { voiceId: "Asuka" },
        },
      ],
    },
  });
  expect((await getCatalog(env, staff.storeId)).configuration.cast.voice.ja).toBeNull();
  const published = await publish();
  expect(published.status).toBe(200);
  expect(configDraftSchema.parse(await published.json()).status).toBe("published");
  expect(provider).toHaveBeenCalledTimes(3);
  provider.mockRejectedValue(new Error(privateBody));
  expect((await publish()).status).toBe(200);
  expect(provider).toHaveBeenCalledTimes(3);
});

it("変更した日英の標準音声を同じ一覧走査で照合し、次ページのAsukaも検証できる", async () => {
  const { staff, draft: initial } = await changedDraft("Asuka");
  const configuration = structuredClone(initial.configuration);
  configuration.cast.voice.en = "Olivia";
  const draft = await updateDraft(env, staff, initial.id, {
    expectedVersion: initial.version,
    configuration,
  });
  const pageToken = "next+/=&?opaque";
  const signals: (AbortSignal | null | undefined)[] = [];
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin + url.pathname).toBe("https://api.inworld.ai/voices/v1/voices");
    expect(url.searchParams.get("filter")).toBe('source = "SYSTEM"');
    expect(url.searchParams.get("pageSize")).toBe("50");
    signals.push(init?.signal);
    if (url.searchParams.get("pageToken") === pageToken)
      return Response.json({
        voices: [
          {
            ...metadata("Asuka"),
            name: "workspaces/inworld/voices/Asuka",
            promptLanguages: ["ja-JP"],
          },
        ],
        totalSize: 2,
        nextPageToken: "",
      });
    return Response.json({
      voices: [metadata("Olivia", "EN_US")],
      totalSize: 2,
      nextPageToken: pageToken,
    });
  });

  const ready = await validateDraft(configured(), staff, draft.id, draft.version);

  expect(ready.status).toBe("ready");
  expect(ready.errors).toEqual([]);
  expect(provider).toHaveBeenCalledTimes(2);
  expect(signals[0]).toBeInstanceOf(AbortSignal);
  expect(signals[1]).toBe(signals[0]);
});

it("空ページに次cursorがある間は探索し、終端まで見つからなかったIDだけを不在とする", async () => {
  const { staff, draft } = await changedDraft("tablecast-missing-voice");
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ voices: [], nextPageToken: "tablecast-next-page" }))
    .mockResolvedValueOnce(Response.json({ voices: [metadata("Asuka")], nextPageToken: "" }));

  const result = await validateDraft(configured(), staff, draft.id, draft.version);

  expect(result.errors).toEqual([
    {
      code: "VOICE_NOT_FOUND",
      path: ["cast", "voice", "ja"],
      params: { voiceId: "tablecast-missing-voice" },
    },
  ]);
  expect(provider).toHaveBeenCalledTimes(2);
});

it.each(["cursor循環", "走査上限", "次ページ障害"])(
  "一覧探索中の%sは不在と誤認せず固定503にし、下書きや秘密を変更・出力しない",
  async (scenario) => {
    const { staff, draft } = await changedDraft("tablecast-missing-voice");
    const before = await getDraft(env, staff, draft.id);
    const logger = vi.spyOn(console, "error");
    let calls = 0;
    const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (scenario === "次ページ障害" && calls === 2)
        return new Response(`${secret}: ${privateBody}`, { status: 503 });
      return Response.json({
        voices: [],
        nextPageToken: scenario === "cursor循環" ? "tablecast-repeated" : `tablecast-page-${calls}`,
      });
    });

    const error: unknown = await validateDraft(configured(), staff, draft.id, draft.version).catch(
      (reason: unknown) => reason,
    );

    expect(error).toMatchObject({ code: "VOICE_CATALOG_UNAVAILABLE", status: 503 });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(privateBody);
    expect(await getDraft(env, staff, draft.id)).toEqual(before);
    expect(provider).toHaveBeenCalledTimes(scenario === "走査上限" ? 40 : 2);
    expect(logger).not.toHaveBeenCalled();
  },
);

it.each(["未設定", "一時障害"])(
  "音声の維持・解除と他項目の編集は一覧用資格が%sでも検証・公開できる",
  async (scenario) => {
    const { staff } = await setupFixture();
    await env.TABLECAST_DB.prepare(
      "UPDATE stores SET config_json=json_set(config_json,'$.cast.voice.ja','tablecast-existing-ja','$.cast.voice.en','tablecast-existing-en') WHERE id=?",
    )
      .bind(staff.storeId)
      .run();
    const provider = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error(privateBody));
    const runtime = {
      ...configured(),
      TABLECAST_INWORLD_VOICES_API_KEY: scenario === "未設定" ? "" : secret,
    };
    const created = await createDraft(runtime, staff);
    const configuration = structuredClone(created.configuration);
    configuration.cast.voice.en = null;
    configuration.cast.instructions.ja = "丁寧に案内する";
    const draft = await updateDraft(runtime, staff, created.id, {
      expectedVersion: created.version,
      configuration,
    });
    const ready = await validateDraft(runtime, staff, draft.id, draft.version);
    expect(ready.status).toBe("ready");
    const result = await publishDraft(runtime, staff, draft.id, {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-voice-preserve",
      approved: true,
    });
    expect(result.status).toBe("published");
    expect(result.configuration.cast.voice).toEqual({ ja: "tablecast-existing-ja", en: null });
    expect(provider).not.toHaveBeenCalled();
  },
);
