import { cleanup, render } from "vitest-browser-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { LocaleProvider } from "../../i18n/locale";
import { LocalCamera, useLocalCamera } from "./local-camera";
import ja from "../../../messages/ja.json";

const streams: MediaStream[] = [];
function cameraStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const stream = canvas.captureStream(10);
  streams.push(stream);
  return stream;
}
function Mirror() {
  const camera = useLocalCamera();
  const [expanded, setExpanded] = useState(false);
  return (
    <LocaleProvider initialLocale="ja" persist={false}>
      <div data-expanded={expanded}>
        <LocalCamera camera={camera} />
      </div>
      <button onClick={() => setExpanded(!expanded)}>表示切替</button>
    </LocaleProvider>
  );
}
beforeEach(() => {
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([]);
});
afterEach(async () => {
  await cleanup();
  streams.splice(0).forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  vi.restoreAllMocks();
});
it("明示開始だけで映像を取得し、表示切替では保持し音声を取得しない", async () => {
  const stream = cameraStream();
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
    const stream = cameraStream();
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
    .mockResolvedValue(cameraStream());
  const screen = await render(<Mirror />);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent(ja.kiosk_camera_permission);
  expect(capture).toHaveBeenCalledTimes(1);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect.element(screen.getByRole("button", { name: ja.kiosk_camera_stop })).toBeVisible();
  expect(capture).toHaveBeenCalledTimes(2);
});
it("選択カメラへの切替とOSによる終了で旧トラックを解放する", async () => {
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue(
    ["front", "back"].map((deviceId) => ({
      deviceId,
      label: deviceId,
      kind: "videoinput",
      groupId: "",
      toJSON: () => ({}),
    })),
  );
  const first = cameraStream(),
    second = cameraStream();
  const capture = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  const screen = await render(<Mirror />);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await screen.getByRole("combobox", { name: ja.kiosk_camera_device }).selectOptions("back");
  await expect.poll(() => document.querySelector("video")?.srcObject).toBe(second);
  expect(first.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
  expect(capture).toHaveBeenLastCalledWith({
    audio: false,
    video: { deviceId: { exact: "back" }, width: { ideal: 640 }, height: { ideal: 480 } },
  });
  second.getVideoTracks()[0]?.dispatchEvent(new Event("ended"));
  await expect.element(screen.getByRole("button", { name: ja.kiosk_camera_start })).toBeVisible();
  expect(second.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
});
