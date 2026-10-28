import type { StaffCall } from "@tablecast/api/schema";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { tableEndpoint } from "../../lib/api";
import { catalog } from "../../test-support/tablecast-fixtures";
import { StaffAssistance } from "./staff-assistance";
import { fixture, mountKiosk, notify, requests } from "./test-support/kiosk-fixture";
import { VoiceConnection } from "./voice-connection";

beforeEach(() => {
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(
    new DOMException("試験では音声を使いません", "NotAllowedError"),
  );
});
const popup = () => page.getByRole("dialog", { name: ja.assistance_title });
const eventReads = () =>
  requests.filter((request) => new URL(request.url).pathname === "/api/table/events").length;
const open = async () => {
  await page.getByRole("button", { name: ja.kiosk_call_staff, exact: true }).click();
  await expect.element(popup()).toBeVisible();
};
const chooseWater = async () => {
  await popup().getByText(ja.assistance_fallback, { exact: true }).click();
  await popup().getByRole("button", { name: "お冷", exact: true }).click();
};
const savedCall: StaffCall = {
  id: "tablecast-history-call",
  createdAt: Date.now(),
  resolvedAt: null,
  status: "pending",
  handoff: {
    summaryJa: "お冷を2つ希望しています。",
    originalText: "Two glasses of water, please.",
    locale: "en",
    attempted: ["お冷の商品をご案内"],
    unresolved: "お冷2つの提供",
  },
};

it.each(["listening", "connecting"] as const)(
  "%sの会話へ用件相談を渡し、接続を作り直さず閉じた後も会話を保つ",
  async (status) => {
    const voice = new VoiceConnection(
      () => {},
      () => {},
    );
    vi.spyOn(voice, "getSnapshot").mockReturnValue({ status });
    const start = vi.spyOn(voice, "start").mockResolvedValue(undefined);
    const request = vi.spyOn(voice, "requestAssistance");
    const stop = vi.spyOn(voice, "stop").mockResolvedValue(undefined);
    await render(
      <LocaleProvider initialLocale="ja" persist={false}>
        <QueryClientProvider client={fixture.client}>
          <StaffAssistance
            catalog={catalog}
            data={fixture.current}
            events={fixture.current.events}
            endpoint={tableEndpoint}
            onChoose={() => {}}
            voice={voice}
          />
        </QueryClientProvider>
      </LocaleProvider>,
    );
    await open();
    await popup().getByRole("button", { name: ja.assistance_fallback, exact: true }).click();
    expect(popup().element().querySelector("details,summary,[data-slot=accordion]")).toBeNull();
    await popup().getByRole("button", { name: ja.common_back, exact: true }).click();
    expect(start).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledExactlyOnceWith();
    await popup().getByRole("button", { name: ja.common_close, exact: true }).click();
    expect(stop).not.toHaveBeenCalled();
  },
);

it("直近の履歴を最初から表示し、用件選択と引き継ぎ詳細へボタンで移動する", async () => {
  fixture.staffCalls = [{ ...savedCall, status: "resolved", resolvedAt: Date.now() }];
  await page.viewport(1180, 820);
  await mountKiosk();
  await open();
  const recent = popup().getByRole("region", { name: ja.assistance_recent, exact: true });
  const preview = recent.getByRole("button", { name: new RegExp(savedCall.handoff.originalText) });
  await expect.element(preview).toBeVisible();
  await expect.element(preview).toMatchTextContent(ja.assistance_resolved);
  await expect
    .element(popup().getByRole("button", { name: "お冷", exact: true }))
    .not.toBeInTheDocument();
  expect(popup().element().getBoundingClientRect().height).toBeLessThan(450);
  expect(
    requests.filter((request) => new URL(request.url).pathname === "/api/table/guidance"),
  ).toHaveLength(0);
  await preview.click();
  await expect
    .element(popup().getByText(savedCall.handoff.summaryJa, { exact: true }))
    .toBeVisible();
  expect(popup().element().querySelector("details,summary,[data-slot=accordion]")).toBeNull();
});

it.each([
  { ordering: false, expected: "停止する" },
  { ordering: true, expected: "継続する" },
])(
  "注文への移行が$orderingのとき、相談で開始した音声を閉じる操作で$expected",
  async ({ ordering }) => {
    const start = vi.spyOn(VoiceConnection.prototype, "start").mockResolvedValue(undefined);
    const stop = vi.spyOn(VoiceConnection.prototype, "stop").mockResolvedValue(undefined);
    await mountKiosk();
    await open();
    expect(start).toHaveBeenCalledWith("ja", fixture.current.speechSpeed, "assistance");
    const before = eventReads();
    if (ordering) notify("cart.updated");
    await expect.poll(eventReads).toBeGreaterThanOrEqual(before + Number(ordering));
    await popup().getByRole("button", { name: ja.common_close, exact: true }).click();
    await expect.element(popup()).not.toBeInTheDocument();
    expect(stop).toHaveBeenCalledTimes(ordering ? 0 : 1);
  },
);

it("案内の読込失敗から再試行でき、呼び出しを送信しない", async () => {
  fixture.guidanceResponse = Response.json({ code: "UNAVAILABLE" }, { status: 503 });
  await mountKiosk();
  await open();
  await chooseWater();
  await expect.element(popup().getByRole("alert")).toBeVisible();
  fixture.guidanceResponse = Response.json({
    configVersion: fixture.current.configVersion,
    guides: [],
    products: [],
    nextOffset: null,
  });
  await popup().getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(popup().getByRole("alert")).not.toBeInTheDocument();
  await expect.element(popup().getByText(ja.assistance_no_answer, { exact: true })).toBeVisible();
  expect(
    requests.filter((request) => new URL(request.url).pathname === "/api/table/call"),
  ).toHaveLength(0);
});

it("長い履歴は吹き出し内でスクロールでき、音声を開始せず直接呼び出しボタンを残す", async () => {
  const start = vi.spyOn(VoiceConnection.prototype, "start").mockResolvedValue(undefined);
  fixture.current.staffCall = structuredClone(savedCall);
  fixture.current.staffCalled = true;
  fixture.staffCalls = Array.from({ length: 20 }, (_, index) => ({
    ...savedCall,
    id: index === 0 ? savedCall.id : `tablecast-history-${index}`,
  }));
  await page.viewport(1024, 768);
  await mountKiosk();
  await page.getByRole("button", { name: ja.assistance_pending, exact: true }).click();
  await expect.poll(() => popup().getByRole("article").elements().length).toBe(20);
  const content = popup()
    .getByRole("region", { name: ja.assistance_history, exact: true })
    .element();
  expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
  content.scrollTo({ top: content.scrollHeight });
  await expect.poll(() => content.scrollTop).toBeGreaterThan(0);
  const direct = popup().getByRole("button", { name: ja.assistance_pending, exact: true });
  await expect.element(direct).toBeVisible();
  expect(direct.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(768);
  await popup().getByRole("button", { name: ja.common_close, exact: true }).click();
  expect(start).not.toHaveBeenCalled();
});

it("吹き出しを開いたまま背景を操作でき、Escapeで閉じて呼び出しボタンへ戻る", async () => {
  await page.viewport(1024, 768);
  await mountKiosk();
  await open();
  expect(popup().element().getAttribute("aria-modal")).not.toBe("true");
  expect(getComputedStyle(document.body).overflow).not.toBe("hidden");
  const background = page.getByRole("tab").nth(2);
  expect(background.element().closest("[inert]")).toBeNull();
  await background.click();
  await expect.element(popup()).toBeVisible();
  const callButton = popup().getByRole("button", { name: ja.assistance_direct, exact: true });
  await expect.element(callButton).toBeEnabled();
  await userEvent.keyboard("{Escape}");
  await expect.element(popup()).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_call_staff, exact: true }))
    .toHaveFocus();
  expect(requests.filter((request) => request.url.includes("/call?")).length).toBe(0);
});

it("音声拒否後も用件を選んで直接呼び出し、メモと呼出中の状態を確認できる", async () => {
  await mountKiosk();
  await open();
  await chooseWater();
  await popup().getByRole("button", { name: ja.assistance_direct, exact: true }).click();
  await expect
    .element(popup().getByText("お冷について店員の対応を希望しています。", { exact: true }))
    .toBeVisible();
  await expect
    .element(popup().getByRole("button", { name: ja.assistance_pending, exact: true }))
    .toBeDisabled();
  const writes = requests.filter((request) => new URL(request.url).pathname === "/api/table/call");
  expect(writes).toHaveLength(1);
  expect(fixture.staffCalls[0]?.handoff).toMatchObject({ originalText: "お冷", locale: "ja" });
});

it("履歴で客の原文を確認でき、対応済み通知でもメモを保持する", async () => {
  fixture.current.staffCall = structuredClone(savedCall);
  fixture.current.staffCalled = true;
  fixture.staffCalls = [structuredClone(savedCall)];
  await mountKiosk();
  await page.getByRole("button", { name: ja.assistance_pending, exact: true }).click();
  await popup()
    .getByRole("button", { name: new RegExp(savedCall.handoff.originalText) })
    .click();
  await expect
    .element(popup().getByText(savedCall.handoff.summaryJa, { exact: true }))
    .toBeVisible();
  await expect
    .element(popup().getByText(savedCall.handoff.originalText, { exact: true }))
    .toBeVisible();
  fixture.staffCalls = [{ ...savedCall, status: "resolved", resolvedAt: Date.now() }];
  fixture.current.staffCall = null;
  fixture.current.staffCalled = false;
  notify("staff.resolved");
  await expect.element(popup().getByText(ja.assistance_resolved, { exact: true })).toBeVisible();
  await expect
    .element(popup().getByText(savedCall.handoff.summaryJa, { exact: true }))
    .toBeVisible();
  expect(
    requests.filter((request) => new URL(request.url).pathname === "/api/table/call"),
  ).toHaveLength(0);
});

it("案内に関連する商品を通常の商品詳細へ渡し、呼び出しや注文を先に実行しない", async () => {
  const product = catalog.configuration.products.find((item) => item.available);
  if (!product) throw new Error("試験用の商品が必要です");
  fixture.guidanceResponse = Response.json({
    configVersion: fixture.current.configVersion,
    guides: [
      {
        id: "tablecast-guide",
        text: {
          displayName: "お冷",
          speechName: "お冷",
          description: "こちらの商品からご依頼ください。",
          aliases: [],
        },
        links: [],
      },
    ],
    products: [{ id: product.id, text: product.text.ja, price: product.price, available: true }],
    nextOffset: null,
  });
  await mountKiosk();
  await open();
  await chooseWater();
  await expect
    .element(popup().getByText("こちらの商品からご依頼ください。", { exact: true }))
    .toBeVisible();
  await popup().getByText(product.text.ja.displayName, { exact: true }).click();
  await expect
    .element(page.getByRole("dialog", { name: product.text.ja.displayName, exact: true }))
    .toBeVisible();
  expect(
    requests.filter(
      (request) => request.method === "POST" && /\/(call|orders)(\?|$)/.test(request.url),
    ),
  ).toHaveLength(0);
});
