import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, server } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { LocalCamera, useLocalCamera } from "./local-camera";

let imageUrl: string | undefined;
const streams: MediaStream[] = [];
const getCamera = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
beforeEach(async () => {
  await page.viewport(1180, 820);
});
async function sourceStream() {
  let stream: MediaStream;
  if (server.browser === "webkit") stream = await getCamera({ audio: false, video: true });
  else {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("映像を描画できません");
    context.fillStyle = "red";
    context.fillRect(0, 0, 320, 480);
    context.fillStyle = "blue";
    context.fillRect(320, 0, 320, 480);
    stream = canvas.captureStream(10);
  }
  streams.push(stream);
  return stream;
}
function Surface() {
  const camera = useLocalCamera();
  const [result, setResult] = useState("");
  return (
    <LocaleProvider initialLocale="ja" persist={false}>
      <MotionProvider>
        <div style={{ width: 240 }}>
          <LocalCamera camera={camera} />
        </div>
        <button
          onClick={() => {
            void camera
              .capture(new AbortController().signal, 60000)
              .then((value) => {
                if ("imageUrl" in value) {
                  imageUrl = value.imageUrl;
                  setResult("取得成功");
                } else setResult(value.error);
              })
              .catch(() => setResult("取得失敗"));
          }}
        >
          画像を読み取る
        </button>
        <button onClick={camera.complete}>読取を完了</button>
        <p>{result}</p>
      </MotionProvider>
    </LocaleProvider>
  );
}
afterEach(async () => {
  await cleanup();
  imageUrl = undefined;
  streams.splice(0).forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  vi.restoreAllMocks();
});

it("ON中の1枚をJPEGで取得し、読取状態を示して完了・OFFで解除する", async () => {
  const stream = await sourceStream();
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("映像trackが必要です");
  const settings = track.getSettings();
  vi.spyOn(track, "getSettings").mockReturnValue({ ...settings, facingMode: undefined });
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([]);
  const screen = await render(<Surface />);
  await screen.getByRole("button", { name: "画像を読み取る" }).click();
  await expect.element(screen.getByText("CAMERA_OFF")).toBeVisible();
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect
    .poll(() => {
      const video = document.querySelector("video");
      return video ? getComputedStyle(video).scale : "";
    })
    .toBe("none");
  await expect
    .poll(() => document.querySelector("video")?.readyState ?? 0)
    .toBeGreaterThanOrEqual(2);
  await screen.getByRole("button", { name: "画像を読み取る" }).click();
  await expect.element(screen.getByText("取得成功")).toBeVisible();
  expect(imageUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(new TextEncoder().encode(imageUrl).byteLength).toBeLessThanOrEqual(60000);
  await expect.element(screen.getByText(ja.kiosk_camera_reading)).toBeVisible();
  const image = new Image();
  image.src = imageUrl ?? "";
  await image.decode();
  expect(image.naturalWidth).toBeGreaterThan(0);
  await screen.getByRole("button", { name: "読取を完了" }).click();
  await expect.element(screen.getByText(ja.kiosk_camera_reading)).not.toBeInTheDocument();
  await screen.getByRole("button", { name: ja.kiosk_camera_stop }).click();
  expect(stream.getTracks()[0]?.readyState).toBe("ended");
});

it("外側へ切り替えると旧映像を解放し、外側のプレビューを鏡像にしない", async () => {
  const front = await sourceStream();
  const back = await sourceStream();
  for (const [stream, facingMode] of [
    [front, "user"],
    [back, "environment"],
  ] as const) {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("カメラtrackが必要です");
    const settings = track.getSettings();
    vi.spyOn(track, "getSettings").mockReturnValue({ ...settings, facingMode });
  }
  const capture = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValueOnce(front)
    .mockResolvedValueOnce(back);
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue(
    ["front", "back"].map((deviceId) => ({
      deviceId,
      kind: "videoinput",
      label: deviceId,
      groupId: "",
      toJSON: () => ({}),
    })),
  );
  const constraints = navigator.mediaDevices.getSupportedConstraints();
  vi.spyOn(navigator.mediaDevices, "getSupportedConstraints").mockReturnValue({
    ...constraints,
    facingMode: true,
  });
  const screen = await render(<Surface />);
  await screen.getByRole("button", { name: ja.kiosk_camera_start }).click();
  await expect
    .poll(() => {
      const video = document.querySelector("video");
      return video ? getComputedStyle(video).scale : "";
    })
    .toBe("-1 1");
  await screen.getByRole("button", { name: ja.kiosk_camera_use_back }).click();
  await expect
    .element(screen.getByRole("button", { name: ja.kiosk_camera_use_front }))
    .toBeVisible();
  expect(front.getTracks()[0]?.readyState).toBe("ended");
  expect(capture).toHaveBeenLastCalledWith({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
  });
  await expect
    .poll(() => {
      const video = document.querySelector("video");
      return video ? getComputedStyle(video).scale : "";
    })
    .toBe("none");
});
