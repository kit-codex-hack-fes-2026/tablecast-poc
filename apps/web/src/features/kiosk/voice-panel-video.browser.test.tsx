import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import "../../styles.css";
import { type ConversationLine } from "./conversation-model";
import { line, started, startedAt, Surface, tool } from "./test-support/voice-panel-fixture";
import { VoicePanel } from "./voice-panel";

it.each(["ja", "en"] as const)(
  "%sの常設会話は映像を小さく保ち、履歴スクロールと設定で下部操作を動かさない",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    const capture = vi.spyOn(navigator.mediaDevices, "getUserMedia");
    const lines: ConversationLine[] = Array.from({ length: 8 }, (_, index) => ({
      id: `tablecast-layout-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      text:
        locale === "ja"
          ? index % 2 === 0
            ? "辛口の日本酒を探しています。おすすめはありますか？"
            : "お刺身にはすっきりした辛口が合います。メニューから容量も選べます。"
          : index % 2 === 0
            ? "Could you recommend a dry sake to go with sashimi?"
            : "A crisp, dry sake is a good pairing. You can choose the serving size from the menu.",
      locale,
      createdAt: startedAt + index * 1000,
      interrupted: false,
    }));
    for (const [width, height, paneWidth, paneHeight] of [
      [1512, 982, 240, 854],
      [1180, 820, 240, 692],
      [820, 1180, 820, 360],
      [402, 874, 402, 360],
    ] as const) {
      await page.viewport(width, height);
      const screen = await render(
        <Surface locale={locale}>
          <div style={{ width: paneWidth, height: paneHeight }}>
            <VoicePanel
              view={{ status: "thinking" }}
              lines={lines}
              events={[started, tool]}
              onStart={() => {}}
              onSpeedChange={() => {}}
              onMicrophoneChange={() => {}}
              onMicrophoneRefresh={() => {}}
            />
          </div>
        </Surface>,
      );
      const panel = screen.getByRole("region", { name: labels.kiosk_conversation }).element();
      const history = panel.querySelector('[data-ui="conversation-history"]');
      const controls = panel.querySelector('[data-theme-part="voice-controls"]');
      const frame = panel.querySelector('[data-ui="camera-frame"]');
      const log = screen.getByRole("log").element();
      const scroller = log.firstElementChild;
      if (!(scroller instanceof HTMLElement) || !history || !controls || !frame)
        throw new Error("会話のスクロール領域がありません");
      expect(history.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
      expect(frame.getBoundingClientRect().width).toBeLessThanOrEqual(128);
      expect(frame.getBoundingClientRect().left).toBe(panel.getBoundingClientRect().left + 12);
      const before = controls.getBoundingClientRect();
      await expect
        .element(screen.getByRole("button", { name: labels.kiosk_latest }))
        .not.toBeInTheDocument();
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, bubbles: true }));
      scroller.scrollTop = 0;
      await expect.poll(() => scroller.scrollTop).toBe(0);
      expect(controls.getBoundingClientRect().top).toBe(before.top);
      expect(controls.getBoundingClientRect().bottom).toBe(before.bottom);
      expect(history.scrollWidth).toBeLessThanOrEqual(history.clientWidth);
      await screen.getByRole("button", { name: labels.kiosk_latest }).click();
      await expect
        .element(screen.getByRole("button", { name: labels.kiosk_latest }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByText(labels.kiosk_tool_running, { exact: true }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: labels.kiosk_debug_details }))
        .not.toBeInTheDocument();
      const settings = screen.getByRole("button", { name: labels.kiosk_input_settings });
      await settings.click();
      await expect
        .element(page.getByRole("slider", { name: labels.kiosk_speech_speed }))
        .toBeVisible();
      await userEvent.keyboard("{Escape}");
      await expect.element(settings).toHaveFocus();
      expect(controls.getBoundingClientRect().top).toBe(before.top);
      expect(controls.getBoundingClientRect().bottom).toBe(before.bottom);
      expect(capture).not.toHaveBeenCalled();
      await page.screenshot({
        path: `../../../test-results/tablecast-conversation-${locale}-${width}.png`,
      });
      await screen.unmount();
    }
    capture.mockRestore();
  },
);

it.each(["ja", "en"] as const)(
  "%sの狭い会話欄で候補と推論要約を常時表示しても履歴と停止操作の領域を保つ",
  async (locale) => {
    await page.viewport(402, 874);
    const labels = locale === "ja" ? ja : en;
    const suggestions =
      locale === "ja"
        ? ["おすすめを教えてください", "お茶の違いを教えてください", "もう大丈夫です"]
        : ["What would you recommend?", "How do these teas differ?", "That is all, thank you."];
    const screen = await render(
      <Surface locale={locale}>
        <div style={{ width: 402, height: 360 }}>
          <VoicePanel
            view={{
              status: "listening",
              suggestions,
              progress: { stage: "thinking", summary: "参考資料を確認しました。".repeat(30) },
              citations: [
                { title: "Reference guide".repeat(10), url: "https://example.com/guide" },
              ],
            }}
            lines={[line]}
            onStart={() => {}}
            onSuggestion={() => {}}
          />
        </div>
      </Surface>,
    );
    const panel = screen.getByRole("region", { name: labels.kiosk_conversation }).element();
    const history = panel.querySelector('[data-ui="conversation-history"]');
    const controls = panel.querySelector('[data-theme-part="voice-controls"]');
    if (!history || !controls) throw new Error("会話と停止操作の領域がありません");
    expect(history.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    expect(controls.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      history.getBoundingClientRect().bottom,
    );
    expect(controls.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      panel.getBoundingClientRect().bottom,
    );
    await expect
      .element(screen.getByRole("button", { name: labels.kiosk_voice_stop }))
      .toBeVisible();
    await screen.unmount();
  },
);

it("映像枠の下のカメラ操作で左上の映像だけを切り替え、会話と音声停止を保つ", async () => {
  await page.viewport(402, 874);
  const source = document.createElement("canvas");
  source.width = 640;
  source.height = 480;
  const context = source.getContext("2d");
  if (!context) throw new Error("検証映像の描画に失敗しました");
  context.fillStyle = "#555";
  context.fillRect(0, 0, 640, 480);
  context.fillStyle = "#eee";
  context.fillRect(80, 80, 180, 240);
  const stream = source.captureStream(10);
  const capture = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([]);
  const startVoice = vi.fn<() => void>();
  try {
    const screen = await render(
      <Surface height={874}>
        <VoicePanel
          view={{ status: "paused" }}
          lines={[line]}
          onStart={startVoice}
          onSpeedChange={() => {}}
          onMicrophoneChange={() => {}}
          onMicrophoneRefresh={() => {}}
        />
      </Surface>,
    );
    const frame = document.querySelector('[data-ui="camera-frame"]');
    if (!frame) throw new Error("映像枠がありません");
    const before = frame.getBoundingClientRect();
    expect(capture).not.toHaveBeenCalled();
    expect(
      frame.contains(screen.getByRole("button", { name: ja.kiosk_camera_start }).element()),
    ).toBe(false);
    await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
    await expect.poll(() => document.querySelector("video")?.srcObject).toBe(stream);
    context.fillRect(100, 100, 180, 240);
    await expect.poll(() => document.querySelector("video")?.readyState).toBeGreaterThanOrEqual(2);
    expect(frame.getBoundingClientRect().width).toBe(before.width);
    expect(frame.getBoundingClientRect().height).toBe(before.height);
    await expect.element(screen.getByText(line.text)).toBeVisible();
    const resume = screen.getByRole("button", { name: ja.kiosk_voice_resume });
    await expect.element(resume).toBeVisible();
    const ring = resume.element().parentElement;
    if (!ring) throw new Error("音声ボタンの虹色リングがありません");
    expect(getComputedStyle(ring).backgroundImage).toContain("conic-gradient");
    const buttonRect = resume.element().getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    expect(buttonRect.left - ringRect.left).toBe(2);
    expect(ringRect.right - buttonRect.right).toBe(2);
    expect(buttonRect.top - ringRect.top).toBe(2);
    expect(ringRect.bottom - buttonRect.bottom).toBe(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await page.screenshot({ path: "../../../test-results/tablecast-conversation-camera-on.png" });
    const footer = document.querySelector('[data-theme-part="voice-controls"]');
    if (!footer) throw new Error("音声操作領域がありません");
    const footerBefore = footer.getBoundingClientRect();
    const resize = screen.getByRole("separator", { name: ja.kiosk_camera_resize });
    await resize.click();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    await expect.poll(() => frame.getBoundingClientRect().width).toBe(176);
    expect(frame.getBoundingClientRect().width / frame.getBoundingClientRect().height).toBeCloseTo(
      4 / 3,
      2,
    );
    expect(footer.getBoundingClientRect().bottom).toBe(footerBefore.bottom);
    expect(document.querySelector("video")?.srcObject).toBe(stream);
    expect(capture).toHaveBeenCalledTimes(1);
    await page.screenshot({
      path: "../../../test-results/tablecast-conversation-camera-resized.png",
    });
    await screen.getByRole("button", { name: ja.kiosk_camera_stop }).click();
    expect(stream.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
    expect(frame.getBoundingClientRect().width).toBe(176);
    expect(startVoice).not.toHaveBeenCalled();
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
});
