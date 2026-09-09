import { QRCodeSVG } from "qrcode.react";
import { cleanup, render } from "vitest-browser-react";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n/locale";
import { DeviceQrReader } from "./device-qr-reader";
import ja from "../../../messages/ja.json";

const streams: MediaStream[] = [];
afterEach(async () => {
  await cleanup();
  for (const stream of streams.splice(0)) for (const track of stream.getTracks()) track.stop();
  vi.restoreAllMocks();
});

it("実QRをカメラ境界から読み取り、成功時にもトラックを終了する", async () => {
  const read = vi.fn<(code: string) => void>();
  const screen = await render(
    <LocaleProvider initialLocale="ja">
      <DeviceQrReader onRead={read} />
      <QRCodeSVG
        value={`${window.location.origin}/device?user_code=TABLECAST-QR`}
        title="試験用QR"
        size={288}
      />
    </LocaleProvider>,
  );
  const svg = document.querySelector("svg:has(title)");
  if (!svg) throw new Error("試験用QRがありません");
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await image.decode();
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 640;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("映像fixtureを描画できません");
    const paint = () => {
      context.fillStyle = "white";
      context.fillRect(0, 0, 640, 640);
      context.drawImage(image, 176, 176, 288, 288);
    };
    paint();
    const stream = canvas.captureStream(10);
    streams.push(stream);
    const timer = setInterval(() => {
      if (stream.getTracks().every((track) => track.readyState === "ended")) clearInterval(timer);
      else paint();
    }, 100);
    return stream;
  });
  await screen.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent(ja.device_scan_success);
  // decoderはフレームごとに通知できる。契約は正しいコードとカメラ解放で、承認は別操作。
  expect(read).toHaveBeenCalledWith("TABLECAST-QR");
  expect(new Set(read.mock.calls.map(([code]) => code))).toEqual(new Set(["TABLECAST-QR"]));
  await expect
    .poll(() => streams.flatMap((stream) => stream.getTracks()).map((track) => track.readyState))
    .toEqual(["ended"]);
});

it.each(["中止", "unmount"])("カメラ取得後の%sで送像を終了する", async (action) => {
  const read = vi.fn<(code: string) => void>();
  const started = Promise.withResolvers<MediaStream>();
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 640;
    const stream = canvas.captureStream(10);
    streams.push(stream);
    started.resolve(stream);
    return stream;
  });
  const screen = await render(
    <LocaleProvider initialLocale="ja">
      <DeviceQrReader onRead={read} />
    </LocaleProvider>,
  );
  await screen.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
  const stream = await started.promise;
  if (action === "中止")
    await screen.getByRole("button", { name: ja.device_scan_stop, exact: true }).click();
  else await screen.unmount();
  await expect.poll(() => stream.getTracks().map((track) => track.readyState)).toEqual(["ended"]);
  expect(read).not.toHaveBeenCalled();
});

it("カメラ拒否を説明し、コード読取のcallbackを呼ばない", async () => {
  const read = vi.fn<(code: string) => void>();
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(
    new DOMException("拒否", "NotAllowedError"),
  );
  const screen = await render(
    <LocaleProvider initialLocale="ja">
      <DeviceQrReader onRead={read} />
    </LocaleProvider>,
  );
  await screen.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent(ja.device_scan_camera_error);
  expect(read).not.toHaveBeenCalled();
});
