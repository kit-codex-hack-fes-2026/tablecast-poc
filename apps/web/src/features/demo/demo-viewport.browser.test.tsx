import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import type { DemoDevice } from "./demo-device-model";
import "../../styles.css";
import { LocaleProvider } from "../../i18n/locale";
import { DemoViewport } from "./demo-viewport";

afterEach(cleanup);
const view = (device: DemoDevice, portrait: boolean, pending = false) => (
  <LocaleProvider initialLocale="ja" persist={false}>
    <div style={{ width: 1000, height: 700, display: "flex" }}>
      <DemoViewport src={pending ? undefined : "about:blank"} device={device} portrait={portrait} />
    </div>
  </LocaleProvider>
);

it("端末の向き・通常表示を切り替えるとviewportを変更しiframeを保持する", async () => {
  const screen = await render(view("ipad", false));
  const iframe = document.querySelector("iframe");
  if (!iframe) throw new Error("iframeが必要です");
  await expect.poll(() => iframe.clientWidth).toBe(1180);
  expect(iframe.clientHeight).toBe(820);
  await screen.rerender(view("ipad", true));
  expect(document.querySelector("iframe")).toBe(iframe);
  expect(iframe.clientWidth).toBe(820);
  expect(iframe.clientHeight).toBe(1180);
  await screen.rerender(view("ipad-air-11", false));
  expect(document.querySelector("iframe")).toBe(iframe);
  expect(iframe.clientWidth).toBe(1180);
  expect(iframe.clientHeight).toBe(820);
  await screen.rerender(view("ipad-air-13", false));
  expect(document.querySelector("iframe")).toBe(iframe);
  expect(iframe.clientWidth).toBe(1366);
  expect(iframe.clientHeight).toBe(1024);
  await screen.rerender(view("ipad-air-13", true));
  expect(iframe.clientWidth).toBe(1024);
  expect(iframe.clientHeight).toBe(1366);
  const frame = screen.getByTestId("demo-device-frame").element().getBoundingClientRect();
  const area = screen.getByTestId("demo-viewport").element().getBoundingClientRect();
  expect(frame.left).toBeGreaterThanOrEqual(area.left);
  expect(frame.right).toBeLessThanOrEqual(area.right);
  expect(frame.top).toBeGreaterThanOrEqual(area.top);
  expect(frame.bottom).toBeLessThanOrEqual(area.bottom);
  await screen.rerender(view("browser", true));
  expect(document.querySelector("iframe")).toBe(iframe);
  expect(iframe.clientWidth).toBe(1000);
  expect(iframe.clientHeight).toBe(700);
  await expect.element(screen.getByTestId("demo-device-frame")).not.toBeInTheDocument();
});

it.each([false, true])(
  "デモ読込中も同じ端末枠と画面領域を保持する（縦向き: %s）",
  async (portrait) => {
    const screen = await render(view("ipad", portrait, true));
    const pending = screen.getByRole("status");
    await expect.poll(() => pending.element().getBoundingClientRect().width).toBeGreaterThan(0);
    const before = pending.element().getBoundingClientRect();
    await screen.rerender(view("ipad", portrait));
    const after = screen
      .getByTitle("会話注文タブレットのデモ画面")
      .element()
      .getBoundingClientRect();
    for (const key of ["x", "y", "width", "height"] as const)
      expect(after[key]).toBeCloseTo(before[key], 1);
  },
);
