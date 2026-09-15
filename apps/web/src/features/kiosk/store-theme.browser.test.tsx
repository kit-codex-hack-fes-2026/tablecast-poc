import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import type { ThemeImage } from "@tablecast/api/schema";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { StoreTheme } from "../../components/store-theme";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { StoreLogo } from "./store-logo";
import { MenuBanners } from "./menu-banners";
import { Button } from "../../components/ui/button";
import "../../styles.css";
const image: ThemeImage = {
  imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
  alt: { ja: "店舗ロゴ", en: "Store logo" },
  imageKind: "illustration",
  imageSource: { generated: false, description: "提供画像" },
};
afterEach(async () => {
  await cleanup();
});
it("部品の装飾は同じ店舗とダイアログだけへ適用する", async () => {
  await render(
    <>
      <div data-theme-part="header" data-testid="admin">
        管理画面
      </div>
      <StoreTheme
        appearance={{
          parts: { header: { background: "#bb241c" }, dialog: { background: "#fff8e7" } },
          customCss:
            '[data-theme-part="product-card"] { border-width:3px; border-style:solid; border-color:#201a16; }',
        }}
      >
        <header data-theme-part="header" data-testid="store">
          店舗
        </header>
        <button data-theme-part="product-card">商品</button>
        <Dialog open>
          <DialogContent>
            <DialogTitle>商品詳細</DialogTitle>
          </DialogContent>
        </Dialog>
      </StoreTheme>
      <StoreTheme appearance={{ parts: { header: { background: "#eeeeee" } } }}>
        <header data-theme-part="header" data-testid="other">
          別店舗
        </header>
      </StoreTheme>
    </>,
  );
  const admin = document.querySelector('[data-testid="admin"]');
  const store = document.querySelector('[data-testid="store"]');
  const other = document.querySelector('[data-testid="other"]');
  const dialog = document.querySelector('[data-theme-part="dialog"]');
  if (!admin || !store || !other || !dialog) throw new Error("表示要素が必要です");
  expect(getComputedStyle(store).backgroundColor).toBe("rgb(187, 36, 28)");
  expect(getComputedStyle(admin).backgroundColor).not.toBe("rgb(187, 36, 28)");
  expect(getComputedStyle(other).backgroundColor).toBe("rgb(238, 238, 238)");
  expect(getComputedStyle(dialog).backgroundColor).toBe("rgb(255, 248, 231)");
});
it.each(["ja", "en"] as const)(
  "%sでチラシ画像が失敗しても商品リンクから通常の商品を選択できる",
  async (locale) => {
    const onChoose = vi.fn<(product: (typeof catalog.configuration.products)[number]) => void>();
    const themed = {
      ...catalog,
      configuration: {
        ...catalog.configuration,
        banners: [
          {
            id: "flyer",
            image,
            enabled: true,
            hotspots: [
              { id: "first", productId: product.id, rect: { x: 0, y: 0, width: 0.5, height: 1 } },
            ],
          },
        ],
      },
    };
    await render(
      <LocaleProvider initialLocale={locale}>
        <MenuBanners catalog={themed} onChoose={onChoose} />
      </LocaleProvider>,
    );
    const picture = document.querySelector("img");
    if (picture) picture.dispatchEvent(new Event("error"));
    await page.getByRole("button", { name: product.text[locale].displayName, exact: true }).click();
    expect(onChoose).toHaveBeenCalledWith(product);
  },
);
it("ロゴ取得失敗時も店名を維持する", async () => {
  await render(
    <LocaleProvider initialLocale="ja">
      <header>
        <StoreLogo logo={image} />
        <span>一乗寺 剛麺研究所</span>
      </header>
    </LocaleProvider>,
  );
  const logo = document.querySelector("img");
  if (logo) logo.dispatchEvent(new Event("error"));
  await expect.element(page.getByText("一乗寺 剛麺研究所")).toBeVisible();
  await expect.element(page.getByRole("img")).not.toBeInTheDocument();
});

it("濃色テーマのダイアログと明るいアクセントのボタンにも文字色を引き継ぐ", async () => {
  await render(
    <StoreTheme appearance={{ colours: { ink: "#ffffff", paper: "#18181b", accent: "#ffdd44" } }}>
      <Dialog open>
        <DialogContent>
          <DialogTitle>注文を確認</DialogTitle>
          <Button>注文する</Button>
          <Button variant="outline">戻る</Button>
        </DialogContent>
      </Dialog>
    </StoreTheme>,
  );
  const dialog = document.querySelector('[data-theme-part="dialog"]');
  const order = page.getByRole("button", { name: "注文する", exact: true }).element();
  const back = page.getByRole("button", { name: "戻る", exact: true }).element();
  if (!dialog) throw new Error("ダイアログが必要です");
  expect(getComputedStyle(dialog).color).toBe("rgb(255, 255, 255)");
  expect(getComputedStyle(order).color).toBe("rgb(0, 0, 0)");
  expect(getComputedStyle(back).backgroundColor).toBe("rgb(24, 24, 27)");
});
