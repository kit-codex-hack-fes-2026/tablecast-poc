import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { StoreTheme } from "../../components/store-theme";
import { event, line, startedAt, Surface } from "./test-support/voice-panel-fixture";
import { VoicePanel } from "./voice-panel";

it.each(["ja", "en"] as const)(
  "%sの未接続画面は中央の音声操作と履歴を保ち、カメラの周囲へ会話を表示する",
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
      const play = screen.getByRole("button", { name: labels.kiosk_voice_start, exact: true });
      const resume = screen.getByRole("button", { name: labels.kiosk_voice_resume, exact: true });
      expect(resume.element().closest("footer")).not.toBeNull();
      await expect
        .element(resume)
        .toHaveTextContent(locale === "ja" ? "音声を再開" : "Resume voice");
      await expect.element(play).toHaveTextContent(labels.kiosk_voice_start);
      const panelBounds = panel.getBoundingClientRect();
      const playBounds = play.element().getBoundingClientRect();
      expect(playBounds.width).toBeGreaterThanOrEqual(100);
      expect(playBounds.height).toBeCloseTo(playBounds.width, 0);
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
      expect(history.getBoundingClientRect().bottom).toBeGreaterThan(playBounds.bottom);
      const overlay = panel.querySelector('[data-ui="voice-start-overlay"]');
      if (!overlay) throw new Error("停止中の暗幕がありません");
      expect(overlay.getBoundingClientRect().width).toBe(panelBounds.width);
      expect(overlay.getBoundingClientRect().height).toBe(panelBounds.height);
      expect(getComputedStyle(overlay).backgroundImage).toContain("radial-gradient");
      await expect.element(screen.getByText(line.text)).toBeVisible();
      expect(panel.textContent).not.toContain(
        locale === "ja" ? "録画・保存" : "recorded or stored",
      );
      await play.click();
      expect(start).toHaveBeenCalledOnce();
      await resume.click();
      expect(start).toHaveBeenCalledTimes(2);
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

it("停止中の入口は短い波紋を出し、動きを減らす設定と接続後は波紋を止める", async () => {
  await page.viewport(1180, 820);
  const screen = await render(<VoiceRippleSurface status="paused" />);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ripples = [...document.querySelectorAll('[data-ui="voice-start-ripple"]')];
  expect(ripples).toHaveLength(2);
  await expect
    .poll(() => ripples.flatMap((ripple) => ripple.getAnimations()).length)
    .toBe(reduced ? 0 : 2);
  const animations = ripples.flatMap((ripple) => ripple.getAnimations());
  expect([
    ...new Set(animations.map((animation) => animation.effect?.getTiming().iterations)),
  ]).toEqual(reduced ? [] : [2]);
  expect(
    Math.max(
      0,
      ...animations.map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0)),
    ),
  ).toBeLessThanOrEqual(2500);
  await screen.rerender(<VoiceRippleSurface status="listening" />);
  expect(document.querySelector('[data-ui="voice-start-overlay"]')).toBeNull();
  expect(document.querySelector('[data-ui="voice-start-ripple"]')).toBeNull();
  await expect
    .poll(() => animations.filter((animation) => animation.playState === "running").length)
    .toBe(0);
  await expect
    .element(screen.getByRole("button", { name: ja.kiosk_voice_stop, exact: true }))
    .toBeVisible();
});

function VoiceRippleSurface({ status }: { status: "listening" | "paused" }) {
  return (
    <Surface>
      <div style={{ width: 240, height: 692 }}>
        <VoicePanel view={{ status }} lines={[]} onStart={() => {}} />
      </div>
    </Surface>
  );
}

it.each(["ja", "en"] as const)(
  "%sの停止中の履歴はオーバーレイの背後まで表示してスクロールでき、正方形の音声操作と下部ボタンを動かさない",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    for (const [width, height, paneWidth, paneHeight] of [
      [1180, 820, 240, 692],
      [402, 874, 402, 360],
    ] as const) {
      await page.viewport(width, height);
      const start = vi.fn<() => void>();
      const screen = await render(
        <Surface locale={locale}>
          <div style={{ width: paneWidth, height: paneHeight }}>
            <VoicePanel
              view={{ status: "paused" }}
              lines={Array.from({ length: 24 }, (_, index) => ({
                ...line,
                id: `tablecast-paused-history-${index}`,
                role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
                text:
                  locale === "ja"
                    ? `${index + 1}：料理のおすすめと注文について相談します。`
                    : `${index + 1}: Could you recommend a dish and help me order?`,
                createdAt: startedAt + index * 1000,
              }))}
              onStart={start}
            />
          </div>
        </Surface>,
      );
      const button = screen.getByRole("button", { name: labels.kiosk_voice_start, exact: true });
      const footer = screen.getByRole("button", { name: labels.kiosk_voice_resume, exact: true });
      const scroller = screen.getByRole("log").element().firstElementChild;
      if (!(scroller instanceof HTMLElement)) throw new Error("会話のスクロール領域がありません");
      await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
      const before = scroller.scrollTop;
      const buttonBounds = button.element().getBoundingClientRect();
      const footerBounds = footer.element().getBoundingClientRect();
      expect(
        scroller.contains(
          document.elementFromPoint(
            buttonBounds.left - 8,
            buttonBounds.top + buttonBounds.height / 2,
          ),
        ),
      ).toBe(true);
      await userEvent.wheel(visibleHistoryTarget(scroller), { delta: { y: -160 } });
      await expect.poll(() => scroller.scrollTop).toBeLessThan(before);
      const after = scroller.scrollTop;
      await userEvent.wheel(visibleHistoryTarget(scroller), { delta: { y: 160 } });
      await expect.poll(() => scroller.scrollTop).toBeGreaterThan(after);
      expect(button.element().getBoundingClientRect().top).toBe(buttonBounds.top);
      expect(footer.element().getBoundingClientRect().top).toBe(footerBounds.top);
      expect(start).not.toHaveBeenCalled();
      await button.click();
      expect(start).toHaveBeenCalledOnce();
      await screen.unmount();
    }
  },
);

function visibleHistoryTarget(scroller: HTMLElement) {
  const viewport = scroller.getBoundingClientRect();
  const target = [...scroller.querySelectorAll("article span, article p")].find((element) => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.top >= viewport.top &&
      bounds.bottom <= viewport.bottom &&
      element.contains(document.elementFromPoint(x, y))
    );
  });
  if (!target) throw new Error("オーバーレイの背後に操作できる履歴がありません");
  return target;
}
