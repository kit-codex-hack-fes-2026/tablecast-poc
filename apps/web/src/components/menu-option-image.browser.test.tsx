import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server.browser";
import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { LocaleProvider } from "../i18n/locale";
import { MenuOptionImage } from "./menu-option-image";

it("hydration前に失敗したSSR画像も代替表示へ切り替える", async () => {
  const content = (
    <LocaleProvider initialLocale="ja">
      <MenuOptionImage
        imageKey="tablecast/images/tablecast-missing-before-hydration.webp"
        imageKind="illustration"
      />
    </LocaleProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(content);
  document.body.appendChild(container);
  const image = container.querySelector("img");
  if (!image) throw new Error("SSR画像がありません。");
  try {
    // サーバーHTMLの画像が失敗してからReactを接続し、取り逃したerrorも復旧する。
    await expect.poll(() => image.complete).toBe(true);
    expect(image.naturalWidth).toBe(0);
    await expect.element(page.getByText("イメージイラスト", { exact: true })).toBeVisible();
    expect(
      page.getByText("イメージイラスト", { exact: true }).element().closest('[aria-hidden="true"]'),
    ).toBeNull();
    const root = hydrateRoot(container, content);
    try {
      await expect.poll(() => container.querySelector("img")).toBeNull();
      expect(container.querySelector("svg")).not.toBeNull();
    } finally {
      root.unmount();
    }
  } finally {
    container.remove();
  }
});
