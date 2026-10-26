import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { StoreTheme } from "../../components/store-theme";
import { event, line, startedAt, Surface } from "./test-support/voice-panel-fixture";
import { VoicePanel } from "./voice-panel";

it.each(["ja", "en"] as const)(
  "%sの未接続画面は中央の再生操作と履歴を保ち、カメラの周囲へ会話を表示する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    for (const [width, height, paneWidth, paneHeight] of [
      [1180, 820, 240, 692],
      [1512, 982, 240, 854],
      [402, 874, 402, 360],
    ] as const) {
      await page.viewport(width, height);
      const start = vi.fn<() => void>();
      const screen = await render(
        <Surface locale={locale}>
          <StoreTheme appearance={{ fonts: { body: "serif", heading: "serif" } }}>
            <div style={{ width: paneWidth, height: paneHeight }}>
              <VoicePanel view={{ status: "paused" }} lines={[line]} onStart={start} />
            </div>
          </StoreTheme>
        </Surface>,
      );
      const panel = screen.getByRole("region", { name: labels.kiosk_conversation }).element();
      const play = screen.getByRole("button", { name: labels.kiosk_voice_resume });
      const panelBounds = panel.getBoundingClientRect();
      const playBounds = play.element().getBoundingClientRect();
      expect(playBounds.width).toBeGreaterThanOrEqual(100);
      expect(playBounds.height).toBeGreaterThanOrEqual(72);
      expect(playBounds.left + playBounds.width / 2).toBeCloseTo(
        panelBounds.left + panelBounds.width / 2,
        0,
      );
      expect(playBounds.top + playBounds.height / 2).toBeCloseTo(
        panelBounds.top + panelBounds.height / 2,
        0,
      );
      expect(getComputedStyle(panel).fontFamily).toContain("sans-serif");
      expect(getComputedStyle(panel).fontFamily).not.toContain("Mincho");
      const heading = panel.querySelector("h2");
      if (!heading) throw new Error("会話見出しがありません");
      expect(getComputedStyle(heading).fontFamily).toContain("sans-serif");
      const frame = panel.querySelector('[data-ui="camera-frame"]');
      const history = panel.querySelector('[data-ui="conversation-history"]');
      if (!frame || !history) throw new Error("カメラと履歴の領域がありません");
      expect(history.getBoundingClientRect().top).toBeLessThanOrEqual(
        frame.getBoundingClientRect().top,
      );
      expect(history.getBoundingClientRect().right).toBeGreaterThan(
        frame.getBoundingClientRect().right,
      );
      expect(history.getBoundingClientRect().bottom).toBeLessThanOrEqual(playBounds.top);
      await expect.element(screen.getByText(line.text)).toBeVisible();
      expect(panel.textContent).not.toContain(
        locale === "ja" ? "録画・保存" : "recorded or stored",
      );
      await play.click();
      expect(start).toHaveBeenCalledOnce();
      await screen.unmount();
    }
  },
);

it.each(["ja", "en"] as const)(
  "%sの既定幅と最小幅で参考カードを収め、画像なしでもQRを表示する",
  async (locale) => {
    await page.viewport(1180, 820);
    for (const width of [240, 224]) {
      const screen = await render(
        <Surface locale={locale}>
          <div style={{ width, height: 692 }}>
            <VoicePanel
              view={{ status: "listening" }}
              onStart={() => {}}
              lines={Array.from({ length: 6 }, (_, i) => ({
                ...line,
                id: `tablecast-history-${i}`,
                role: "assistant" as const,
                text:
                  locale === "ja"
                    ? "お茶の種類や淹れ方もご案内します。"
                    : "I can help you choose a tea and explain how to prepare it.",
                createdAt: startedAt + i * 1000,
              }))}
              events={[
                event(10, "voice.reference", {
                  turnId: "tablecast-reference",
                  reference: {
                    url: "https://example.com/tea",
                    title: locale === "ja" ? "お茶の淹れ方" : "Tea brewing guide",
                    description:
                      locale === "ja"
                        ? "お茶をおいしく淹れるための参考情報です。"
                        : "A short guide to brewing a cup of tea.",
                  },
                }),
              ]}
            />
          </div>
        </Surface>,
      );
      const card = document.querySelector('[data-ui="voice-reference"]');
      if (!(card instanceof HTMLElement)) throw new Error("参考カードがありません");
      expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(width - 24);
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
      const qr = card.querySelector("svg:has(title)");
      if (!qr) throw new Error("QRがありません");
      expect(qr.getBoundingClientRect().width).toBeLessThanOrEqual(144);
      expect(qr.getBoundingClientRect().width).toBeGreaterThanOrEqual(140);
      await expect
        .element(
          screen.getByRole("button", {
            name: locale === "ja" ? ja.kiosk_reference_expand : en.kiosk_reference_expand,
          }),
        )
        .toBeVisible();
      await screen.unmount();
    }
  },
);
