import { env } from "cloudflare:workers";
import { Resolver } from "node:dns/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getTableState } from "../src/modules/tables/queries";
import { changeLocale } from "../src/modules/tables/use-cases/presentation";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { referenceMetadata } from "../src/modules/voice/use-cases/reference-metadata";
import { createApiServices } from "../src/platform/context";
import { device, setupFixture } from "./fixture";
import { runVoiceTurn } from "./voice-fixture";

beforeEach(() => {
  vi.spyOn(Resolver.prototype, "resolve4").mockResolvedValue(["93.184.216.34"]);
  vi.spyOn(Resolver.prototype, "resolve6").mockResolvedValue(["2606:4700:4700::1111"]);
});
afterEach(() => vi.restoreAllMocks());
const signal = () => new AbortController().signal;
const html = () =>
  new Response(
    '<title>Fallback title</title><meta property="og:title" content="Tea guide"><meta property="og:description" content="Learn about tea."><meta property="og:image" content="/tea.png"><link rel="icon" href="/icon.png">',
    { headers: { "Content-Type": "text/html" } },
  );

it("公開ページからOGP・相対画像・faviconを取得し、HTMLを返さない", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(html());
  expect(await referenceMetadata({ url: "https://example.com/tea" }, signal())).toEqual({
    url: "https://example.com/tea",
    title: "Tea guide",
    description: "Learn about tea.",
    imageUrl: "https://example.com/tea.png",
    faviconUrl: "https://example.com/icon.png",
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([
  "http://example.com",
  "https://127.0.0.1",
  "https://2130706433",
  "https://[::1]",
  "https://example.local",
  "https://user:password@example.com",
])("%sはページ取得前に拒否する", async (url) => {
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(referenceMetadata({ url }, signal())).rejects.toHaveProperty(
    "code",
    "REFERENCE_URL_INVALID",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("DNSがprivate addressを含む場合とprivate URLへのredirectを拒否する", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  vi.mocked(Resolver.prototype.resolve4).mockResolvedValueOnce(["10.0.0.1"]);
  await expect(referenceMetadata({ url: "https://example.com" }, signal())).rejects.toHaveProperty(
    "code",
    "REFERENCE_URL_INVALID",
  );
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValue(
    new Response(null, { status: 302, headers: { Location: "https://169.254.169.254" } }),
  );
  await expect(referenceMetadata({ url: "https://example.com" }, signal())).rejects.toHaveProperty(
    "code",
    "REFERENCE_URL_INVALID",
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it("大きな本文と取得失敗でもURLとタイトルを残してQR表示を継続できる", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response("x".repeat(256 * 1024 + 1), { headers: { "Content-Type": "text/html" } }),
    );
  const expected = {
    url: "https://example.com/tea",
    title: "Tea",
    faviconUrl: "https://example.com/favicon.ico",
  };
  expect(await referenceMetadata({ url: expected.url, title: "Tea" }, signal())).toEqual(expected);
  fetch.mockRejectedValue(new Error("Reference unavailable"));
  expect(await referenceMetadata({ url: expected.url, title: "Tea" }, signal())).toEqual(expected);
});

it("3秒の期限と3回のredirect上限で取得を打ち切る", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://example.com/next" } }),
    );
  try {
    await expect(
      referenceMetadata({ url: "https://example.com/tea" }, signal()),
    ).resolves.toHaveProperty("url", "https://example.com/tea");
    expect(fetch).toHaveBeenCalledTimes(4);
    vi.mocked(Resolver.prototype.resolve4).mockImplementation(() => new Promise(() => {}));
    const pending = referenceMetadata({ url: "https://example.com/tea" }, signal());
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toHaveProperty("url", "https://example.com/tea");
    expect(fetch).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});

async function setupReference() {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, "tablecast-reference-live");
  const turn = await runVoiceTurn({
    voiceSessionId: "tablecast-reference-live",
    turnId: "tablecast-reference-turn",
    locale: "ja",
    messages: [],
  });
  await turn.finish();
  return services;
}

const referenceCall = {
  voiceSessionId: "tablecast-reference-live",
  turnId: "tablecast-reference-turn",
  toolName: "showReference" as const,
  toolCallId: "tablecast-reference-call",
  arguments: { url: "https://example.com/tea" },
};
it("認可した参考カードだけを卓の会話へ保存し、注文を変更しない", async () => {
  const services = await setupReference();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(html());
  await invokeVoiceTool(services, referenceCall, signal());
  const state = await getTableState(services, device);
  expect(state.events.find((event) => event.kind === "voice.reference")?.data).toHaveProperty(
    "reference.title",
    "Tea guide",
  );
  expect(state.cart.lines).toHaveLength(0);
  expect(state.orders).toHaveLength(0);
});

it.each(["停止", "言語変更"])(
  "メタデータ取得中の%sでは遅着したカードを保存しない",
  async (operation) => {
    const services = await setupReference();
    const pending = Promise.withResolvers<Response>();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => pending.promise);
    const result = invokeVoiceTool(services, referenceCall, signal()).catch(
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      if (operation === "停止") await setVoiceSession(services, device, null);
      else await changeLocale(services, device, "en");
      pending.resolve(html());
      await expect(result).resolves.toHaveProperty("code", "REFERENCE_NOT_SHOWN");
      expect(
        (await getTableState(services, device)).events.some(
          (event) => event.kind === "voice.reference",
        ),
      ).toBe(false);
    } finally {
      pending.resolve(html());
      await result;
    }
  },
);
