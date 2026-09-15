import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider } from "../i18n/locale";
import { PwaInstallToast } from "./pwa-install-toast";
import "../styles.css";

const dismissedKey = "tablecast-pwa-install-dismissed";

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  sessionStorage.removeItem(dismissedKey);
  await page.viewport(1280, 720);
});

function installOffer(
  prompt = vi.fn<() => Promise<{ outcome: "accepted" | "dismissed" }>>(async () => ({
    outcome: "accepted",
  })),
) {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
  });
  window.dispatchEvent(event);
  return event;
}

it("インストール可能になるまで隠し、ボタン操作でだけ標準確認を一度開く", async () => {
  await page.viewport(390, 844);
  await render(<PwaInstallToast />);
  await expect
    .element(page.getByRole("button", { name: "インストール", exact: true }))
    .not.toBeInTheDocument();
  const event = installOffer();
  const install = page.getByRole("button", { name: "インストール", exact: true });
  await expect.element(install).toBeVisible();
  const bounds = page.getByRole("region").element().getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "../../test-results/browser/tablecast-pwa-install-ja.png" });
  expect(event.defaultPrevented).toBe(true);
  expect(event.prompt).not.toHaveBeenCalled();
  await install.click();
  expect(event.prompt).toHaveBeenCalledTimes(1);
  await expect.element(install).not.toBeInTheDocument();
  installOffer();
  await expect.element(install).not.toBeInTheDocument();
});

it("閉じた案内は再マウント後も同じセッションで表示しない", async () => {
  await render(<PwaInstallToast />);
  installOffer();
  await page.getByRole("button", { name: "インストールの案内を閉じる" }).click();
  await cleanup();
  await render(<PwaInstallToast />);
  installOffer();
  await expect.element(page.getByRole("region")).not.toBeInTheDocument();
});

it("standaloneで起動したiPhoneには案内しない", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const result = matchMedia(query);
    if (query === "(display-mode: standalone)")
      Object.defineProperty(result, "matches", { value: true });
    return result;
  });
  await render(<PwaInstallToast />);
  installOffer();
  await expect.element(page.getByRole("region")).not.toBeInTheDocument();
});

it("インストール完了イベントで案内を閉じる", async () => {
  await render(<PwaInstallToast />);
  installOffer();
  await expect.element(page.getByRole("region")).toBeVisible();
  window.dispatchEvent(new Event("appinstalled"));
  await expect.element(page.getByRole("region")).not.toBeInTheDocument();
});

it.each([
  { label: "iPhone", userAgent: "iPhone", touches: 1, width: 390 },
  { label: "デスクトップ表示のiPad", userAgent: "Macintosh", touches: 5, width: 1024 },
])("$labelには手動追加手順を英語で表示する", async ({ userAgent, touches, width }) => {
  await page.viewport(width, 768);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(touches);
  await render(
    <LocaleProvider initialLocale="en" persist={false}>
      <PwaInstallToast />
    </LocaleProvider>,
  );
  await expect
    .element(page.getByText("Open this page in Safari, tap Share, then Add to Home Screen."))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Install", exact: true }))
    .not.toBeInTheDocument();
  const bounds = page.getByRole("region").element().getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(width);
  await page.screenshot({
    path: `../../test-results/browser/tablecast-pwa-install-en-${width}.png`,
  });
  await page.getByRole("button", { name: "Dismiss installation reminder" }).click();
  await expect.element(page.getByRole("region")).not.toBeInTheDocument();
});

it("標準確認に失敗したらブラウザーメニューの代替手順を示す", async () => {
  await render(<PwaInstallToast />);
  installOffer(
    vi
      .fn<() => Promise<{ outcome: "accepted" | "dismissed" }>>()
      .mockRejectedValue(new Error("拒否")),
  );
  await page.getByRole("button", { name: "インストール", exact: true }).click();
  await expect
    .element(page.getByText("インストール画面を開けませんでした。", { exact: false }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "インストール", exact: true }))
    .not.toBeInTheDocument();
});

it("保存禁止でもキーボードで閉じ、同じ画面では再表示しない", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("保存禁止");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("保存禁止");
  });
  await render(<PwaInstallToast />);
  installOffer();
  const dismiss = page.getByRole("button", { name: "インストールの案内を閉じる" });
  await expect.element(dismiss).toBeVisible();
  dismiss.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("region")).not.toBeInTheDocument();
  installOffer();
  await expect.element(page.getByRole("region")).not.toBeInTheDocument();
});
