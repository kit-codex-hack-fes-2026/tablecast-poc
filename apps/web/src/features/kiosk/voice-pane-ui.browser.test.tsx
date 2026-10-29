import { renderToStaticMarkup } from "react-dom/server.browser";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { StoreTheme } from "../../components/store-theme";
import { event, line, startedAt, Surface } from "./test-support/voice-panel-fixture";
import { VoicePanel } from "./voice-panel";

it.each(["ja", "en"] as const)(
  "%sのSSR案内はカメラ余白を予約し、後続の説明と操作で先頭を動かさない",
  async (locale) => {
    await page.viewport(1024, 768);
    for (const width of [224, 240, 402]) {
      const host = document.createElement("div");
      try {
        host.innerHTML = renderToStaticMarkup(
          <Surface locale={locale}>
            <div style={{ width, height: width === 402 ? 360 : 692 }}>
              <VoicePanel view={{ status: "idle" }} lines={[]} onStart={() => {}} />
            </div>
          </Surface>,
        );
        document.body.appendChild(host);
        const welcome = host.querySelector('[data-ui="voice-welcome"]');
        const camera = host.querySelector('[data-ui="camera-window"]');
        const content = host.querySelector('[role="log"] > div > div');
        const footer = host.querySelector("footer");
        if (!welcome || !camera || !content || !footer || !footer.parentElement)
          throw new Error("SSRの会話領域がありません");
        const panel = footer.parentElement;
        expect(Number.parseFloat(getComputedStyle(content).paddingTop)).toBeCloseTo(
          camera.getBoundingClientRect().height + 12,
        );
        const later = [...welcome.children].slice(1);
        later.forEach((element) => element.remove());
        footer.remove();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const graphic = welcome.firstElementChild;
        if (!graphic) throw new Error("SSRの案内イラストがありません");
        const before = graphic.getBoundingClientRect();
        later.forEach((element) => welcome.appendChild(element));
        panel.appendChild(footer);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const after = graphic.getBoundingClientRect();
        expect(after.top).toBeCloseTo(before.top);
        expect(after.left).toBeCloseTo(before.left);
        expect(welcome.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          camera.getBoundingClientRect().bottom,
        );
        const begin = welcome.querySelector("button");
        const viewport = host.querySelector('[role="log"]');
        if (!begin || !viewport) throw new Error("SSRの開始操作がありません");
        expect(begin.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          viewport.getBoundingClientRect().bottom,
        );
      } finally {
        host.remove();
      }
    }
  },
);

it.each(["ja", "en"] as const)(
  "%sの未接続画面は下部の音声操作と履歴を保ち、カメラの周囲へ会話を表示する",
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
      const resume = screen.getByRole("button", { name: labels.kiosk_voice_resume, exact: true });
      expect(resume.element().closest("footer")).not.toBeNull();
      await expect
        .element(resume)
        .toHaveTextContent(locale === "ja" ? "音声を再開" : "Resume voice");
      expect(getComputedStyle(panel).fontFamily).toContain("sans-serif");
      expect(getComputedStyle(panel).fontFamily).not.toContain("Mincho");
      const heading = panel.querySelector("h2");
      if (!heading) throw new Error("会話見出しがありません");
      expect(getComputedStyle(heading).fontFamily).toContain("sans-serif");
      const frame = panel.querySelector('[data-ui="camera-frame"]');
      const history = panel.querySelector('[data-ui="conversation-history"]');
      if (!frame || !history) throw new Error("カメラと履歴の領域がありません");
      const cameraWindow = frame.parentElement;
      if (!cameraWindow) throw new Error("カメラの操作領域がありません");
      await expect
        .poll(() => screen.getByText(line.text).element().getBoundingClientRect().top)
        .toBeGreaterThanOrEqual(cameraWindow.getBoundingClientRect().bottom);
      expect(history.getBoundingClientRect().top).toBeLessThanOrEqual(
        frame.getBoundingClientRect().top,
      );
      expect(history.getBoundingClientRect().right).toBeGreaterThan(
        frame.getBoundingClientRect().right,
      );
      const controls = panel.querySelector("footer");
      if (!controls) throw new Error("下部の音声操作がありません");
      expect(history.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        controls.getBoundingClientRect().top,
      );
      await expect.element(screen.getByText(line.text)).toBeVisible();
      expect(panel.textContent).not.toContain(
        locale === "ja" ? "録画・保存" : "recorded or stored",
      );
      await resume.click();
      expect(start).toHaveBeenCalledOnce();
      await screen.unmount();
    }
  },
);

it.each(["ja", "en"] as const)(
  "%sの初期案内から会話を始められ、マイク設定を開け、会話後は案内を重ねない",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    for (const [width, height, paneWidth, paneHeight] of [
      [1180, 820, 240, 692],
      [402, 874, 402, 360],
    ] as const) {
      await page.viewport(width, height);
      const start = vi.fn<() => void>();
      const refresh = vi.fn<() => void>();
      const props = {
        onStart: start,
        onMicrophoneChange: vi.fn<(id: string) => void>(),
        onMicrophoneRefresh: refresh,
      };
      const surface = (status: "connecting" | "idle" | "paused", hasHistory = false) => (
        <Surface locale={locale}>
          <div style={{ width: paneWidth, height: paneHeight }}>
            <VoicePanel {...props} view={{ status }} lines={hasHistory ? [line] : []} />
          </div>
        </Surface>
      );
      const screen = await render(surface("idle"));
      const begin = screen.getByRole("button", { name: labels.kiosk_welcome_start, exact: true });
      await expect.element(begin).toBeVisible();
      const scroller = screen.getByRole("log").element().firstElementChild;
      if (!(scroller instanceof HTMLElement)) throw new Error("会話のスクロール領域がありません");
      expect(begin.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scroller.getBoundingClientRect().bottom,
      );
      const welcome = document.querySelector('[data-ui="voice-welcome"]');
      const pulse = document.querySelector('[data-ui="voice-welcome-pulse"]');
      if (!welcome || !pulse) throw new Error("初期案内がありません");
      expect(scroller.contains(welcome)).toBe(true);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      await expect.poll(() => pulse.getAnimations().length).toBe(reduced ? 0 : 1);
      const animations = pulse.getAnimations();
      expect(animations.map((animation) => animation.effect?.getTiming().iterations)).toEqual(
        reduced ? [] : [3],
      );
      await screen.getByRole("button", { name: labels.kiosk_input_settings }).click();
      await expect.element(screen.getByRole("dialog")).toBeVisible();
      expect(refresh).toHaveBeenCalledOnce();
      expect(start).not.toHaveBeenCalled();
      await screen.getByRole("button", { name: labels.common_close, exact: true }).click();
      await begin.click();
      expect(start).toHaveBeenCalledOnce();
      await screen.rerender(surface("connecting"));
      await expect.element(screen.getByText(labels.kiosk_welcome_title)).not.toBeInTheDocument();
      expect(animations.filter((animation) => animation.playState === "running")).toHaveLength(0);
      await screen.rerender(surface("paused", true));
      await expect.element(screen.getByText(labels.kiosk_welcome_title)).not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: labels.kiosk_voice_resume, exact: true }))
        .toBeVisible();
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

it.each(["ja", "en"] as const)(
  "%sの停止中の履歴を全高でスクロールでき、下部の音声操作を動かさない",
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
      const footer = screen.getByRole("button", { name: labels.kiosk_voice_resume, exact: true });
      const scroller = screen.getByRole("log").element().firstElementChild;
      if (!(scroller instanceof HTMLElement)) throw new Error("会話のスクロール領域がありません");
      await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
      await expect
        .poll(() => Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop))
        .toBeLessThanOrEqual(1);
      const before = scroller.scrollTop;
      const footerBounds = footer.element().getBoundingClientRect();
      const up = new Promise<void>((resolve) =>
        scroller.addEventListener("scrollend", () => resolve(), { once: true }),
      );
      await userEvent.wheel(visibleHistoryTarget(scroller), { delta: { y: -160 } });
      await up;
      await expect.poll(() => scroller.scrollTop).toBeLessThan(before);
      const after = scroller.scrollTop;
      const down = new Promise<void>((resolve) =>
        scroller.addEventListener("scrollend", () => resolve(), { once: true }),
      );
      await userEvent.wheel(visibleHistoryTarget(scroller), { delta: { y: 160 } });
      await down;
      await expect.poll(() => scroller.scrollTop).toBeGreaterThan(after);
      expect(footer.element().getBoundingClientRect().top).toBe(footerBounds.top);
      expect(start).not.toHaveBeenCalled();
      await footer.click();
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
  if (!target) throw new Error("操作できる会話履歴がありません");
  return target;
}
