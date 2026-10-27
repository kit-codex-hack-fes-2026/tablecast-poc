import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import type { VoicePanelProps } from "./voice-panel";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { event, startedAt, Surface } from "./test-support/voice-panel-fixture";
import { VoicePanel } from "./voice-panel";

it.each(["ja", "en"] as const)(
  "%sの候補カードは狭い会話欄に収まり、追加時に動いて最新の発話を追従中だけ固定する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    const base = catalog.configuration.products[0];
    if (!base) throw new Error("表示する商品がありません");
    const products = Array.from({ length: 4 }, (_, index) => ({
      ...base,
      id: `tablecast-offer-${index}`,
      text: {
        ...base.text,
        [locale]: {
          ...base.text[locale],
          displayName: `${locale === "ja" ? "季節のおすすめ" : "Seasonal recommendation"} ${index} ${"Komorebi".repeat(12)}`,
        },
      },
    }));
    const nextCatalog = { ...catalog, configuration: { ...catalog.configuration, products } };
    for (const width of [224, 240, 600]) {
      await page.viewport(1180, 820);
      const choose = vi.fn<NonNullable<VoicePanelProps["onChoose"]>>();
      const suggestion = vi.fn<NonNullable<VoicePanelProps["onSuggestion"]>>();
      const text =
        locale === "ja"
          ? "容量は90mLと180mL、どちらにしますか？"
          : "Would you prefer 90mL or 180mL?";
      const lines = Array.from({ length: 18 }, (_, index) => ({
        id: `tablecast-line-${index}`,
        role: "assistant" as const,
        locale,
        text:
          index === 17
            ? text
            : `${locale === "ja" ? "お料理のご案内です。" : "Here are our recommendations."} ${index}`,
        createdAt: startedAt + index,
        interrupted: false,
      }));
      const props = {
        lines,
        catalog: nextCatalog,
        onChoose: choose,
        onStart: vi.fn<() => void>(),
        onSuggestion: suggestion,
      };
      const surface = (show: boolean, suggestions?: string[]) => (
        <Surface locale={locale} height={692}>
          <div style={{ width, height: 692 }}>
            <VoicePanel
              {...props}
              view={{ status: "listening", suggestions }}
              events={
                show
                  ? [
                      event(1, "voice.products", {
                        turnId: "tablecast-offers",
                        productIds: products.toReversed().map(({ id }) => id),
                      }),
                    ]
                  : []
              }
            />
          </div>
        </Surface>
      );
      const screen = await render(surface(false));
      const current = screen.getByText(text).element();
      await expect
        .poll(() => current.closest('[data-ui="conversation-entry"]')?.getAttribute("data-pinned"))
        .toBe("true");
      await screen.rerender(surface(true));
      const row = document.querySelector('[data-ui="conversation-products"]');
      if (!(row instanceof HTMLElement)) throw new Error("商品カードがありません");
      const mounting = row.closest('[data-ui="voice-products-entry"]');
      if (!mounting) throw new Error("商品の表示領域がありません");
      expect(mounting.getAnimations().length).toBe(
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1,
      );
      const card = row.querySelector("button");
      if (!card) throw new Error("商品を選択できません");
      expect(card.querySelector("strong")?.textContent).toBe(
        products.at(-1)?.text[locale].displayName,
      );
      expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(176);
      expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(260);
      expect(row.getBoundingClientRect().width).toBeLessThanOrEqual(width - 24);
      const scroller = screen.getByRole("log").element().firstElementChild;
      if (!(scroller instanceof HTMLElement)) throw new Error("会話のスクロール領域がありません");
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
      await expect
        .poll(() => current.getBoundingClientRect().bottom)
        .toBeLessThanOrEqual(scroller.getBoundingClientRect().bottom);
      await expect
        .poll(() => current.getBoundingClientRect().top)
        .toBeGreaterThanOrEqual(scroller.getBoundingClientRect().top);
      const options = [
        locale === "ja" ? "90mLでお願いします" : "90mL, please",
        locale === "ja" ? "180mLでお願いします" : "180mL, please",
      ];
      await screen.rerender(surface(true, options));
      const suggestions = screen.getByLabelText(labels.kiosk_suggestions).element();
      const animation = suggestions.closest('[data-ui="voice-suggestions-entry"]');
      if (!animation) throw new Error("発話候補の表示領域がありません");
      expect(animation.getAnimations().length).toBe(
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1,
      );
      await screen.getByRole("button", { name: options[0], exact: true }).click();
      expect(suggestion).toHaveBeenCalledWith(options[0], options);
      await userEvent.wheel(screen.getByText(text), { delta: { y: -400 } });
      await expect
        .poll(() => current.closest('[data-ui="conversation-entry"]')?.getAttribute("data-pinned"))
        .toBe("false");
      const before = scroller.scrollTop;
      await screen.rerender(surface(true, []));
      await expect.poll(() => scroller.scrollTop).toBeLessThanOrEqual(before + 1);
      const bounds = scroller.getBoundingClientRect();
      const visible = [...scroller.querySelectorAll("article")].find((element) => {
        const box = element.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom;
      });
      if (!visible) throw new Error("履歴を読む位置がありません");
      await userEvent.wheel(visible, { delta: { y: 80 } });
      await expect
        .poll(() => current.closest('[data-ui="conversation-entry"]')?.getAttribute("data-pinned"))
        .toBe("false");
      await screen.unmount();
    }
  },
);
