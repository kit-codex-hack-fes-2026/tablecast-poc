import { resolveLocalized } from "@tablecast/api/localization";
import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { catalog, product, table } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import ko from "../../../messages/ko.json";
import zh from "../../../messages/zh-Hans.json";
import { fixture, mountKiosk } from "./test-support/kiosk-fixture";

const languages = { ja, en, "zh-Hans": zh, ko };
it.each(["ja", "en", "zh-Hans", "ko"] as const)(
  "%sの代表画面はseedの店舗設定・商品・価格・実画像を使い、画像読込後に記録する",
  async (locale) => {
    const labels = languages[locale];
    await mountSeed(locale);
    const conversation = page.getByRole("region", { name: labels.kiosk_conversation, exact: true });
    await expect
      .element(
        conversation.getByText(resolveLocalized(product.text, locale).displayName, { exact: true }),
      )
      .toBeVisible();
    await expect.element(conversation.getByText(product.id)).not.toBeInTheDocument();
    for (const [width, height] of [
      [1180, 820],
      [1512, 982],
      [402, 874],
    ] as const) {
      await page.viewport(width, height);
      await Promise.all(
        [
          ...document.querySelectorAll(
            '[data-ui="voice-products-entry"], [data-ui="conversation-entry"]',
          ),
        ].flatMap((element) => element.getAnimations().map((animation) => animation.finished)),
      );
      if (width === 402) {
        const menu = page.getByRole("tabpanel", { name: labels.kiosk_menu, exact: true });
        const name = resolveLocalized(product.text, locale);
        menu
          .getByText(locale === "ja" ? name.displayName : name.transliteration, { exact: true })
          .element()
          .scrollIntoView({ block: "end", behavior: "instant" });
      }
      const visible = [...document.images].filter((image) => {
        const bounds = image.getBoundingClientRect();
        return (
          image.src.includes("/images/tablecast/") &&
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.top < height &&
          bounds.bottom > 0 &&
          bounds.left < width &&
          bounds.right > 0 &&
          document.elementFromPoint(
            Math.min(width - 1, Math.max(0, bounds.left + Math.min(16, bounds.width / 2))),
            Math.min(height - 1, Math.max(0, bounds.top + Math.min(16, bounds.height / 2))),
          ) === image
        );
      });
      expect(visible.length).toBeGreaterThanOrEqual(2);
      // 撮影対象の実画像を読み込み、headless iframeのlazy判定に撮影準備を依存させない。
      for (const image of visible) image.loading = "eager";
      await expect
        .poll(async () => {
          try {
            await Promise.all(visible.map((image) => image.decode()));
            return visible.every((image) => image.naturalWidth > 0);
          } catch {
            return false;
          }
        })
        .toBe(true);
      expect(visible.every((image) => image.naturalWidth > 0)).toBe(true);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      const banner = document.querySelector('header [data-ui="store-logo-banner"] img');
      if (!(banner instanceof HTMLImageElement)) throw new Error("seedの店舗バナーがありません。");
      expect(banner.naturalWidth).toBeGreaterThan(0);
      expect(banner.getAttribute("src")).toContain(
        catalog.configuration.branding?.banner?.imageKey,
      );
      await page.screenshot({
        path: `../../../test-results/tablecast-seed-${locale}-${width}.png`,
      });
    }
  },
);

it.each(["ja", "en", "zh-Hans", "ko"] as const)(
  "%sの商品DialogとカゴPopoverをseed実画像で記録する",
  async (locale) => {
    const labels = languages[locale];
    await mountSeed(locale);
    for (const [width, height] of [
      [1512, 982],
      [1180, 820],
      [402, 874],
    ] as const) {
      await page.viewport(width, height);
      const menu = page.getByRole("tabpanel", { name: labels.kiosk_menu, exact: true });
      const card = menu.getByRole("button", {
        name: new RegExp(resolveLocalized(product.text, locale).displayName),
      });
      await card.click();
      const dialog = page.getByRole("dialog", {
        name: resolveLocalized(product.text, locale).displayName,
        exact: true,
      });
      await expect
        .element(dialog.getByRole("button", { name: labels.kiosk_add, exact: true }))
        .toBeVisible();
      const images = [...dialog.element().querySelectorAll("img")];
      for (const image of images) image.loading = "eager";
      await Promise.all(images.map((image) => image.decode()));
      const photo = dialog.element().querySelector('[data-ui="product-image-transition"]');
      if (!photo) throw new Error("共有する商品写真が必要です");
      await expect.poll(() => getComputedStyle(photo).transform).toBe("none");
      await page.screenshot({
        path: `../../../test-results/tablecast-order-dialog-${locale}-${width}.png`,
      });
      await dialog.getByRole("button", { name: labels.common_close, exact: true }).click();
      await expect.element(dialog).not.toBeInTheDocument();
    }
    await page.viewport(1180, 820);
    await page.getByRole("tab", { name: new RegExp(`^${labels.kiosk_cart}`) }).click();
    const review = page.getByRole("button", { name: labels.kiosk_review, exact: true });
    await expect.element(review).toBeVisible();
    await page.screenshot({
      path: `../../../test-results/tablecast-order-popover-${locale}-1180.png`,
    });
  },
);

async function mountSeed(locale: keyof typeof languages) {
  fixture.current = structuredClone(table);
  fixture.current.locale = locale;
  fixture.catalogResponse = Response.json(catalog);
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([
    {
      deviceId: "default",
      groupId: "tablecast-ipad",
      kind: "audioinput",
      label: "iPad microphone",
      toJSON: () => ({}),
    },
  ]);
  fixture.current.events = [
    {
      cursor: 1,
      kind: "voice.user",
      data: {
        role: "user",
        locale,
        text:
          locale === "ja"
            ? "お刺身に合う日本酒はありますか？"
            : locale === "zh-Hans"
              ? "有什么适合搭配生鱼片的清酒？"
              : locale === "ko"
                ? "사시미에 어울리는 사케가 있나요?"
                : "Which sake goes well with sashimi?",
      },
    },
    {
      cursor: 2,
      kind: "voice.tool",
      data: {
        turnId: "tablecast-seed-turn",
        toolCallId: "tablecast-seed-call",
        toolName: "getCatalog",
        state: "completed",
        query: product.id,
      },
    },
    {
      cursor: 3,
      kind: "voice.products",
      data: {
        turnId: "tablecast-seed-turn",
        productIds: catalog.configuration.products
          .filter((item) => item.available)
          .slice(0, 4)
          .map((item) => item.id),
      },
    },
    {
      cursor: 4,
      kind: "voice.assistant",
      data: {
        role: "assistant",
        locale,
        text:
          locale === "ja"
            ? "お造りには月凪がおすすめです。気になる料理はありますか？"
            : locale === "zh-Hans"
              ? "月凪很适合搭配生鱼片。想了解一下吗？"
              : locale === "ko"
                ? "쓰키나기는 사시미와 잘 어울려요. 설명해 드릴까요?"
                : "Tsukinagi pairs well with sashimi. Would you like to hear about it?",
      },
    },
  ].map((event) => ({
    ...event,
    storeId: table.storeId,
    tableSessionId: table.id,
    createdAt: table.openedAt + event.cursor * 1000,
  }));
  fixture.current.cursor = 4;
  await page.viewport(1180, 820);
  await mountKiosk();
}
