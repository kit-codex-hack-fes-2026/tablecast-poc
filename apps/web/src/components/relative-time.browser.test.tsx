import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { LocaleProvider } from "../i18n/locale";
import { RelativeTime } from "./relative-time";

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

it("開いたまま経過時間を更新し、正確な日時を保持する", async () => {
  const createdAt = Date.parse("2026-10-29T00:00:00Z");
  const now = createdAt + 180_000;
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(now);
  await render(
    <LocaleProvider initialLocale="en" persist={false}>
      <RelativeTime value={createdAt} initialNow={now} />
    </LocaleProvider>,
  );
  await expect.element(page.getByText("3 minutes ago", { exact: true })).toBeVisible();
  const element = page.getByText("3 minutes ago", { exact: true }).element();
  expect(element.getAttribute("dateTime")).toBe("2026-10-29T00:00:00.000Z");
  expect(element.getAttribute("title")).toBe("Thursday, 29 October 2026, 09:00");
  await vi.advanceTimersByTimeAsync(60_000);
  await expect.element(page.getByText("4 minutes ago", { exact: true })).toBeVisible();
});
