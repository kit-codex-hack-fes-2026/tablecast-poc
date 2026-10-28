import type { StaffCall } from "@tablecast/api/schema";
import { beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { catalog } from "../../test-support/tablecast-fixtures";
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
    id: `tablecast-history-${index}`,
  }));
  await page.viewport(1024, 768);
  await mountKiosk();
  await page.getByRole("button", { name: ja.assistance_pending, exact: true }).click();
  await expect.element(popup().getByRole("article").nth(0)).toBeVisible();
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
  await popup().getByRole("button", { name: "お冷", exact: true }).click();
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
  await popup().getByRole("button", { name: ja.assistance_history, exact: true }).click();
  await expect
    .element(popup().getByText(savedCall.handoff.summaryJa, { exact: true }))
    .toBeVisible();
  await popup().getByText(ja.assistance_original, { exact: true }).click();
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
