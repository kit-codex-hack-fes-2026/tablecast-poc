import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { LanguageSwitch } from "../../components/language-switch";
import { Money } from "../../components/money";
import { LocaleProvider, useI18n } from "../../i18n/locale";
import { tableEndpoint } from "../../lib/api";
import "../../styles.css";
import { CurrencyProvider, useCurrencyControls } from "./currency-provider";
import { CurrencySelector } from "./currency-selector";

const snapshot = {
  base: "JPY",
  date: "2026-10-22",
  source: "currency-api",
  rates: { USD: 0.0065, AUD: 0.00967, KRW: 9.12, GBP: 0.005 },
};
const storageKey = "tablecast-display-currency:table";
let client: QueryClient;
beforeEach(() => {
  localStorage.removeItem(storageKey);
  client = new QueryClient();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(snapshot)),
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  localStorage.removeItem(storageKey);
  vi.unstubAllGlobals();
});
function AgentControls() {
  const controls = useCurrencyControls();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          controls?.controller.apply({
            currency: "AUD",
            revision: controls.controller.getContext().revision,
          })
        }
      >
        エージェントでAUD
      </button>
      <button
        type="button"
        onClick={() => controls?.controller.apply({ currency: "USD", revision: 0 })}
      >
        遅着したUSD
      </button>
    </>
  );
}
function Harness({ sessionId }: { sessionId: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <CurrencyProvider
      key={sessionId}
      locale={locale}
      endpoint={tableEndpoint}
      sessionId={sessionId}
    >
      <LanguageSwitch onChange={setLocale} />
      <CurrencySelector />
      <Money value={1000} />
      <AgentControls />
    </CurrencyProvider>
  );
}
const mount = (sessionId = "tablecast-currency-visit", locale: "en" | "ja" = "ja") =>
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <Harness sessionId={sessionId} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
async function select(code: string) {
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(code) }).click();
}

it("円を主表示に保ち、通貨の選択後は言語連動と再取得を行わない", async () => {
  await mount();
  await expect.element(page.getByText("¥1,000", { exact: true })).toBeVisible();
  await page.getByRole("combobox").click();
  await expect
    .element(page.getByText("外貨は目安です。お支払いは日本円となります。"))
    .toBeVisible();
  await expect.element(page.getByText("A$ AUD · オーストラリア ドル")).toBeVisible();
  await page.getByRole("option", { name: /AUD/ }).click();
  await expect.element(page.getByText("≈ A$9.67", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect.element(page.getByRole("combobox")).toHaveTextContent("A$ AUD");
  await select("GBP");
  await expect.element(page.getByRole("combobox")).toHaveTextContent("£ GBP");
  await select("JPY");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect.element(page.getByRole("combobox")).toHaveTextContent("¥ JPY");
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("visibilitychange"));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("未操作なら言語に連動し、最初から英語の場合もUSDを表示する", async () => {
  await mount("tablecast-currency-english", "en");
  await expect.element(page.getByText("≈ US$6.50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect.element(page.getByRole("combobox")).toHaveTextContent("¥ JPY");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect.element(page.getByRole("combobox")).toHaveTextContent("US$ USD");
});

it("同じ来店で復元し、新しい来店では前の客の通貨を引き継がない", async () => {
  await mount();
  await select("AUD");
  await expect.element(page.getByText("≈ A$9.67", { exact: true })).toBeVisible();
  await cleanup();
  await mount();
  await expect.element(page.getByRole("combobox")).toHaveTextContent("A$ AUD");
  await cleanup();
  await mount("tablecast-next-visit");
  await expect.element(page.getByRole("combobox")).toHaveTextContent("¥ JPY");
});

it("エージェントから表示を変更し、遅れた指示では現在の選択を上書きしない", async () => {
  await mount();
  await page.getByRole("button", { name: "エージェントでAUD" }).click();
  await expect.element(page.getByText("≈ A$9.67", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "遅着したUSD" }).click();
  await expect.element(page.getByRole("combobox")).toHaveTextContent("A$ AUD");
});

it("取得失敗時も円の金額と通貨選択を維持し、参考額を捏造しない", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: { code: "DISPLAY_RATES_UNAVAILABLE" } }), { status: 503 }),
  );
  await mount();
  await select("AUD");
  await expect.element(page.getByText("¥1,000", { exact: true })).toBeVisible();
  await page.getByRole("combobox").click();
  await expect.element(page.getByText("参考レートを取得できません").last()).toBeVisible();
  expect(document.body.textContent).not.toContain("≈ A$");
  expect(fetch).toHaveBeenCalledTimes(1);
});
