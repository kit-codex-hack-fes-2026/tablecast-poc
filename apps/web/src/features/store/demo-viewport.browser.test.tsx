import { cleanup, render } from "vitest-browser-react";
import { afterEach, expect, it } from "vitest";
import { LocaleProvider } from "../../i18n/locale";
import { DemoViewport } from "./demo-viewport";
import "../../styles.css";

afterEach(cleanup);
const view = (tablet: boolean, portrait: boolean) => (
  <LocaleProvider>
    <div style={{ width: 1000, height: 700, display: "flex" }}>
      <DemoViewport src="about:blank" tablet={tablet} portrait={portrait} />
    </div>
  </LocaleProvider>
);

it("端末の向き・通常表示を切り替えるとviewportを変更しiframeを保持する", async () => {
  const screen = await render(view(true, false));
  const iframe = document.querySelector("iframe");
  if (!iframe) throw new Error("iframeが必要です");
  await expect.poll(() => iframe.clientWidth).toBe(1180);
  expect(iframe.clientHeight).toBe(820);
  await screen.rerender(view(true, true));
  expect(document.querySelector("iframe")).toBe(iframe);
  expect(iframe.clientWidth).toBe(820);
  expect(iframe.clientHeight).toBe(1180);
  await screen.rerender(view(false, true));
  expect(document.querySelector("iframe")).toBe(iframe);
  expect(iframe.clientWidth).toBe(1000);
  expect(iframe.clientHeight).toBe(700);
});
