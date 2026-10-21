import { useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, server, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { LocalCamera, LocalCameraFrame, useLocalCamera } from "./local-camera";

const streams: MediaStream[] = [];
const paints: ReturnType<typeof setInterval>[] = [];
const captureCamera = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
async function cameraStream(width = 640, height = 480) {
  let stream: MediaStream;
  if (server.browser === "webkit") {
    // Linux WebKitでも実映像metadataを取得できる標準テスト用カメラを使う。
    stream = await captureCamera({
      audio: false,
      video: { width: { exact: width }, height: { exact: height } },
    });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("映像fixtureを描画できません");
    const paint = () => {
      context.fillStyle = "#d4d4d4";
      context.fillRect(0, 0, width, height);
    };
    paint();
    stream = canvas.captureStream(10);
    paints.push(setInterval(paint, 100));
  }
  streams.push(stream);
  return stream;
}
function Mirror() {
  const camera = useLocalCamera();
  const [expanded, setExpanded] = useState(false);
  return (
    <LocaleProvider initialLocale="ja" persist={false}>
      <div data-expanded={expanded} style={{ width: 128 }}>
        <LocalCamera camera={camera} />
      </div>
      <button onClick={() => setExpanded(!expanded)}>表示切替</button>
    </LocaleProvider>
  );
}
function BoundedMirror({
  width = 320,
  height = 640,
  locale = "ja",
}: {
  height?: number;
  locale?: "en" | "ja";
  width?: number;
}) {
  const camera = useLocalCamera();
  const bounds = useRef<HTMLDivElement>(null);
  return (
    <LocaleProvider initialLocale={locale} persist={false}>
      <div ref={bounds} data-testid="camera-bounds" style={{ width, height }}>
        <LocalCamera camera={camera} boundsRef={bounds} />
      </div>
    </LocaleProvider>
  );
}
function twoCameras() {
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue(
    ["front", "back"].map((deviceId) => ({
      deviceId,
      label: deviceId,
      kind: "videoinput",
      groupId: "",
      toJSON: () => ({}),
    })),
  );
}
function cameraFrame() {
  const frame = document.querySelector('[data-ui="camera-frame"]');
  if (!(frame instanceof HTMLElement)) throw new Error("カメラ枠がありません");
  return frame;
}
beforeEach(() => {
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([]);
});
afterEach(async () => {
  await cleanup();
  paints.splice(0).forEach(clearInterval);
  streams.splice(0).forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  vi.restoreAllMocks();
});
it("常設枠はオフでも同寸法を保ち、明示操作だけで撮影する", async () => {
  const stream = await cameraStream();
  const capture = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <div style={{ width: 240 }}>
        <LocalCameraFrame />
      </div>
    </LocaleProvider>,
  );
  const frame = document.querySelector('[data-ui="camera-frame"]');
  if (!frame) throw new Error("常設カメラ枠がありません");
  const before = frame.getBoundingClientRect();
  expect(capture).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await page.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.poll(() => document.querySelector("video")?.srcObject).toBe(stream);
  expect(frame.getBoundingClientRect().height).toBe(before.height);
  await page.getByRole("button", { name: ja.kiosk_camera_stop }).click();
  expect(frame.getBoundingClientRect().height).toBe(before.height);
  expect(stream.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
  expect(capture).toHaveBeenCalledTimes(1);
});
it("明示開始だけで映像を取得し、表示切替では保持し音声を取得しない", async () => {
  const stream = await cameraStream();
  const capture = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
  const screen = await render(<Mirror />);
  expect(capture).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.poll(() => document.querySelector("video")?.srcObject).toBe(stream);
  expect(capture).toHaveBeenCalledWith({
    audio: false,
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
  });
  await screen.getByRole("button", { name: "表示切替" }).click();
  expect(capture).toHaveBeenCalledTimes(1);
  expect(document.querySelector("video")?.srcObject).toBe(stream);
  expect(stream.getTracks().map((track) => track.readyState)).toEqual(["live"]);
  await screen.getByRole("button", { name: ja.kiosk_camera_stop }).click();
  expect(stream.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
});
it.each(["stop", "unmount", "hidden"])(
  "取得待ちの%sの後に届いた映像も直ちに停止する",
  async (action) => {
    const deferred = Promise.withResolvers<MediaStream>();
    const stream = await cameraStream();
    const capture = vi
      .spyOn(navigator.mediaDevices, "getUserMedia")
      .mockReturnValue(deferred.promise);
    const screen = await render(<Mirror />);
    try {
      await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
      if (action === "stop")
        await screen.getByRole("button", { name: ja.kiosk_camera_stop }).click();
      else if (action === "unmount") await screen.unmount();
      else {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        document.dispatchEvent(new Event("visibilitychange"));
      }
      deferred.resolve(stream);
      await expect
        .poll(() => stream.getTracks().map((track) => track.readyState))
        .toEqual(["ended"]);
      expect(capture).toHaveBeenCalledTimes(1);
    } finally {
      deferred.resolve(stream);
      await deferred.promise;
    }
  },
);
it("権限拒否を表示し、自動再試行せず明示操作で再開できる", async () => {
  const capture = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockRejectedValueOnce(new DOMException("拒否", "NotAllowedError"))
    .mockResolvedValue(await cameraStream());
  const screen = await render(<Mirror />);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent(ja.kiosk_camera_permission);
  expect(screen.getByRole("alert").element().closest("[data-ui=camera-frame]")).not.toBeNull();
  expect(screen.getByRole("alert").element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
    screen.getByRole("button", { name: ja.kiosk_camera_start }).element().getBoundingClientRect()
      .top,
  );
  await page.screenshot({ path: "../../../test-results/tablecast-camera-permission.png" });
  expect(capture).toHaveBeenCalledTimes(1);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.element(screen.getByRole("button", { name: ja.kiosk_camera_stop })).toBeVisible();
  expect(capture).toHaveBeenCalledTimes(2);
});
it("カメラ切替の取得待ちも選択入口とfocusを保ち、旧トラックを解放する", async () => {
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue(
    ["front", "back"].map((deviceId) => ({
      deviceId,
      label: deviceId,
      kind: "videoinput",
      groupId: "",
      toJSON: () => ({}),
    })),
  );
  const replacement = Promise.withResolvers<void>();
  const capture = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockImplementationOnce(() => cameraStream(1280, 720))
    .mockImplementationOnce(async () => {
      const next = await cameraStream(720, 1280);
      await replacement.promise;
      return next;
    });
  const screen = await render(<BoundedMirror />);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  const first: unknown = await capture.mock.results[0]?.value;
  if (!(first instanceof MediaStream)) throw new Error("初回の映像がありません");
  await expect.poll(() => document.querySelector("video")?.videoWidth).toBe(1280);
  await expect
    .poll(() => {
      const rect = cameraFrame().getBoundingClientRect();
      return rect.width / rect.height;
    })
    .toBeCloseTo(16 / 9, 2);
  const before = cameraFrame().getBoundingClientRect();
  const video = document.querySelector("video");
  const cameraSelect = page.getByRole("combobox", { name: ja.kiosk_camera_device });
  await expect.element(cameraSelect).toBeVisible();
  expect(cameraSelect.element().closest("[data-ui=camera-frame]")).not.toBeNull();
  const selectBounds = cameraSelect.element().getBoundingClientRect();
  const toggleBounds = screen
    .getByRole("button", { name: ja.kiosk_camera_stop })
    .element()
    .getBoundingClientRect();
  expect(selectBounds.width).toBeGreaterThanOrEqual(44);
  expect(toggleBounds.height).toBeGreaterThanOrEqual(44);
  expect(selectBounds.right).toBeLessThanOrEqual(toggleBounds.left);
  await page.screenshot({ path: "../../../test-results/tablecast-camera-devices.png" });
  const trigger = cameraSelect.element();
  try {
    await cameraSelect.click();
    await page.getByRole("option", { name: "back", exact: true }).click();
    await expect.element(cameraSelect).toHaveAttribute("aria-busy", "true");
    await expect.element(cameraSelect).toHaveFocus();
    expect(cameraSelect.element()).toBe(trigger);
    expect(cameraFrame().getBoundingClientRect().height).toBe(before.height);
    expect(first.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
    replacement.resolve();
    const second: unknown = await capture.mock.results[1]?.value;
    if (!(second instanceof MediaStream)) throw new Error("切替後の映像がありません");
    await expect.poll(() => document.querySelector("video")?.srcObject).toBe(second);
    await expect.poll(() => document.querySelector("video")?.videoWidth).toBe(720);
    await expect
      .poll(() => {
        const rect = cameraFrame().getBoundingClientRect();
        return rect.width / rect.height;
      })
      .toBeCloseTo(9 / 16, 2);
    expect(document.querySelector("video")).toBe(video);
    await expect.element(cameraSelect).toHaveFocus();
    expect(cameraSelect.element()).toBe(trigger);
  } finally {
    replacement.resolve();
    await replacement.promise;
  }
  expect(first.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
  expect(capture).toHaveBeenLastCalledWith({
    audio: false,
    video: { deviceId: { exact: "back" }, width: { ideal: 640 }, height: { ideal: 480 } },
  });
  const second: unknown = await capture.mock.results[1]?.value;
  if (!(second instanceof MediaStream)) throw new Error("切替後の映像がありません");
  second.getVideoTracks()[0]?.dispatchEvent(new Event("ended"));
  await expect.element(screen.getByRole("button", { name: ja.kiosk_camera_start })).toBeVisible();
  expect(second.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
});

it.each([
  [1280, 720],
  [720, 1280],
  [1280, 800],
  [900, 1000],
])(
  "%s×%sの実映像比率と44px操作領域を狭い会話欄でも保ち、停止後も寸法を維持する",
  async (sourceWidth, sourceHeight) => {
    twoCameras();
    const capture = vi
      .spyOn(navigator.mediaDevices, "getUserMedia")
      .mockImplementation(() => cameraStream(sourceWidth, sourceHeight));
    await render(<BoundedMirror width={216} height={344} />);
    await page.getByRole("button", { name: ja.kiosk_camera_start }).click();
    await expect.poll(() => document.querySelector("video")?.videoWidth).toBe(sourceWidth);
    const resize = page.getByRole("separator", { name: ja.kiosk_camera_resize });
    await resize.click();
    await userEvent.keyboard("{Home}");
    const frame = cameraFrame();
    const before = frame.getBoundingClientRect();
    expect(before.width / before.height).toBeCloseTo(sourceWidth / sourceHeight, 2);
    expect(before.width).toBeLessThanOrEqual(216);
    expect(before.height).toBeLessThanOrEqual(144);
    const controls = [
      resize.element(),
      page.getByRole("combobox", { name: ja.kiosk_camera_device }).element(),
      page.getByRole("button", { name: ja.kiosk_camera_stop }).element(),
    ];
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.left).toBeGreaterThanOrEqual(before.left);
      expect(rect.right).toBeLessThanOrEqual(before.right + 0.1);
      expect(rect.top).toBeGreaterThanOrEqual(before.top);
      expect(rect.bottom).toBeLessThanOrEqual(before.bottom + 0.1);
      for (const other of controls.filter((item) => item !== control)) {
        const second = other.getBoundingClientRect();
        expect(
          rect.right <= second.left ||
            second.right <= rect.left ||
            rect.bottom <= second.top ||
            second.bottom <= rect.top,
        ).toBe(true);
      }
    }
    await page.screenshot({
      path: `../../../test-results/tablecast-camera-${sourceWidth}-${sourceHeight}.png`,
    });
    await page.getByRole("button", { name: ja.kiosk_camera_stop }).click();
    expect(frame.getBoundingClientRect().width).toBe(before.width);
    expect(frame.getBoundingClientRect().height).toBe(before.height);
    expect(capture).toHaveBeenCalledTimes(1);
  },
);
it("キーボードで最大・最小へ変更し、親領域を縮めても映像を作り直さず幅を復元する", async () => {
  const capture = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockImplementation(() => cameraStream(1280, 720));
  const screen = await render(<BoundedMirror />);
  await page.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.poll(() => document.querySelector("video")?.videoWidth).toBe(1280);
  const stream: unknown = await capture.mock.results[0]?.value;
  if (!(stream instanceof MediaStream)) throw new Error("映像がありません");
  const video = document.querySelector("video");
  const resize = page.getByRole("separator", { name: ja.kiosk_camera_resize });
  await resize.click();
  await userEvent.keyboard("{End}");
  await expect.poll(() => cameraFrame().getBoundingClientRect().width).toBe(320);
  await userEvent.keyboard("{ArrowLeft}");
  await expect.poll(() => cameraFrame().getBoundingClientRect().width).toBe(304);
  await screen.rerender(<BoundedMirror width={200} />);
  await expect.poll(() => cameraFrame().getBoundingClientRect().width).toBe(200);
  await screen.rerender(<BoundedMirror />);
  await expect.poll(() => cameraFrame().getBoundingClientRect().width).toBe(304);
  await expect.element(resize).toHaveFocus();
  expect(document.querySelector("video")).toBe(video);
  expect(video?.srcObject).toBe(stream);
  expect(capture).toHaveBeenCalledTimes(1);
  await userEvent.keyboard("{Home}");
  await expect.poll(() => cameraFrame().getBoundingClientRect().width).toBe(140);
});
it("右下ハンドルを下へドラッグすると比率を保って拡大し、終了後は寸法を変えない", async () => {
  await render(<BoundedMirror />);
  const resize = page.getByRole("separator", { name: ja.kiosk_camera_resize });
  const target = page.getByTestId("camera-bounds");
  const before = cameraFrame().getBoundingClientRect();
  const corner = resize.element().getBoundingClientRect();
  expect(corner.right).toBe(before.right);
  expect(corner.bottom).toBe(before.bottom);
  await userEvent.dragAndDrop(resize, target, {
    sourcePosition: { x: 22, y: 22 },
    targetPosition: { x: 106, y: 160 },
  });
  const after = cameraFrame().getBoundingClientRect();
  expect(after.width).toBeGreaterThan(128);
  expect(after.width).toBeLessThanOrEqual(320);
  expect(after.width / after.height).toBeCloseTo(4 / 3, 2);
  await target.hover({ position: { x: 300, y: 22 } });
  expect(cameraFrame().getBoundingClientRect().width).toBe(after.width);
});
it("ドラッグ中のキャンセルは元の寸法に戻し、次の操作を妨げない", async () => {
  await render(<BoundedMirror />);
  const resize = page.getByRole("separator", { name: ja.kiosk_camera_resize });
  const handle = resize.element();
  if (!(handle instanceof HTMLElement)) throw new Error("リサイズ操作がありません");
  let pressed = false;
  handle.addEventListener(
    "pointerdown",
    () => {
      pressed = true;
    },
    { once: true },
  );
  const cancel = (event: PointerEvent) => {
    if (!pressed) return;
    handle.dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: event.pointerId, bubbles: true }),
    );
    handle.removeEventListener("pointermove", cancel);
  };
  handle.addEventListener("pointermove", cancel);
  await userEvent.dragAndDrop(resize, page.getByTestId("camera-bounds"), {
    sourcePosition: { x: 22, y: 22 },
    targetPosition: { x: 280, y: 22 },
  });
  expect(cameraFrame().getBoundingClientRect().width).toBe(128);
  await resize.click();
  await userEvent.keyboard("{ArrowRight}");
  await expect.poll(() => cameraFrame().getBoundingClientRect().width).toBe(144);
});

it.each(["NotAllowedError", "NotFoundError"])(
  "英語の%sは縦映像の枠内で操作と重ならない",
  async (errorName) => {
    twoCameras();
    const capture = vi
      .spyOn(navigator.mediaDevices, "getUserMedia")
      .mockImplementationOnce(() => cameraStream(720, 1280))
      .mockRejectedValueOnce(new DOMException("camera", errorName));
    await render(<BoundedMirror width={216} height={344} locale="en" />);
    await page.getByRole("button", { name: en.kiosk_camera_start }).click();
    await expect.poll(() => document.querySelector("video")?.videoWidth).toBe(720);
    await page.getByRole("button", { name: en.kiosk_camera_stop }).click();
    await page.getByRole("button", { name: en.kiosk_camera_start }).click();
    const message =
      errorName === "NotAllowedError" ? en.kiosk_camera_permission : en.kiosk_camera_unavailable;
    const error = page.getByRole("button", { name: `${en.kiosk_camera_start}: ${message}` });
    await expect.element(error).toBeVisible();
    await expect.element(error).toHaveAttribute("title", `${en.kiosk_camera_start}: ${message}`);
    const frame = cameraFrame().getBoundingClientRect();
    const controls = [
      error.element(),
      page.getByRole("combobox", { name: en.kiosk_camera_device }).element(),
      page.getByRole("separator", { name: en.kiosk_camera_resize }).element(),
    ];
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.top).toBeGreaterThanOrEqual(frame.top);
      expect(rect.bottom).toBeLessThanOrEqual(frame.bottom);
      expect(rect.right).toBeLessThanOrEqual(frame.right);
      for (const other of controls.filter((item) => item !== control)) {
        const second = other.getBoundingClientRect();
        expect(
          rect.right <= second.left ||
            second.right <= rect.left ||
            rect.bottom <= second.top ||
            second.bottom <= rect.top,
        ).toBe(true);
      }
    }
    expect(capture).toHaveBeenCalledTimes(2);
  },
);
