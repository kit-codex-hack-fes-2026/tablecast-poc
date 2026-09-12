import { createTablecastClient, parseResponse } from "@tablecast/api/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider } from "../i18n/locale";
import { ErrorNotice } from "./error-notice";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";
import "../styles.css";

afterEach(cleanup);

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeのRPC失敗は原因別に案内し、再試行操作と入力を保持する",
  async ({ locale, labels }) => {
    // Given: 実hcと標準解析へ渡すHTTP応答。入力は画面に残す。
    const retry = vi.fn<() => void>();
    const cases = [
      [401, labels.common_session_error],
      [403, labels.common_forbidden],
      [404, labels.common_not_found],
      [409, labels.common_conflict],
      [410, labels.common_conflict],
      [400, labels.common_invalid_input],
      [422, labels.common_invalid_input],
      [413, labels.common_too_large],
      [429, labels.common_rate_limited],
      [500, labels.common_unavailable],
      [502, labels.common_unavailable],
      [503, labels.common_unavailable],
      [504, labels.common_unavailable],
    ] as const;
    let response: Response;
    const client = createTablecastClient("https://tablecast.test", { fetch: async () => response });
    const view = (error: unknown, retrying = false) => (
      <LocaleProvider initialLocale={locale}>
        <label>
          店舗名
          <input defaultValue="卓上喫茶" />
        </label>
        <ErrorNotice error={error} onRetry={retry} retrying={retrying} />
      </LocaleProvider>
    );
    const screen = await render(view(null));
    await page.getByRole("textbox").fill("変更中の店舗名");
    for (const [status, message] of cases) {
      // When: 業務エラーを受ける。
      response = Response.json(
        { error: { code: "TABLECAST_ERROR", message: "private server detail" } },
        { status },
      );
      const error: unknown = await parseResponse(client.api.admin.stores.$get()).catch(
        (failure: unknown) => failure,
      );
      await screen.rerender(view(error));
      // Then: 内部メッセージを出さず、原因に合う文言と入力を保つ。
      await expect.element(page.getByRole("alert")).toHaveTextContent(message);
      await expect.element(page.getByRole("alert")).not.toHaveTextContent("private server detail");
      await expect.element(page.getByRole("textbox")).toHaveValue("変更中の店舗名");
      if (status === 422)
        await page.screenshot({
          path: `../../test-results/browser/tablecast-rpc-validation-${locale}.png`,
          element: page.getByRole("alert"),
        });
      await page.getByRole("button", { name: labels.common_retry }).click();
    }
    expect(retry).toHaveBeenCalledTimes(cases.length);
    await screen.rerender(view(new TypeError("network"), true));
    await expect.element(page.getByRole("alert")).toHaveTextContent(labels.common_connection_error);
    await expect.element(page.getByRole("button")).toBeDisabled();
    await page.screenshot({ path: `../../test-results/browser/tablecast-rpc-error-${locale}.png` });
  },
);
