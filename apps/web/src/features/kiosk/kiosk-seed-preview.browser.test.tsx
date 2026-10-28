import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { catalog, product, table } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { fixture, mountKiosk } from "./test-support/kiosk-fixture";

it.each(["ja", "en"] as const)(
  "%sの代表画面はseedの店舗設定・商品・価格・実画像を使い、画像読込後に記録する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
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
    const conversation = page.getByRole("region", { name: labels.kiosk_conversation, exact: true });
    await expect
      .element(conversation.getByText(product.text[locale].displayName, { exact: true }))
      .toBeVisible();
    await expect.element(conversation.getByText(product.id)).not.toBeInTheDocument();
    for (const [width, height] of [
      [1180, 820],
      [402, 874],
      [1512, 982],
    ] as const) {
      await page.viewport(width, height);
      await Promise.all(
        [
          ...document.querySelectorAll(
            '[data-ui="voice-products-entry"], [data-ui="conversation-entry"]',
          ),
        ].flatMap((element) => element.getAnimations().map((animation) => animation.finished)),
      );
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
    const card = conversation.getByRole("button", {
      name: new RegExp(product.text[locale].displayName),
    });
    await card.click();
    const details = page.getByRole("region", {
      name: product.text[locale].displayName,
      exact: true,
    });
    await expect.element(details).toBeVisible();
    await details.getByRole("button", { name: labels.common_close, exact: true }).click();
    await expect.element(details).not.toBeInTheDocument();
  },
);
