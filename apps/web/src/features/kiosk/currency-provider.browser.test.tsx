import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useContext } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import { LanguageSwitch } from "../../components/language-switch";
import { Money, PriceChange } from "../../components/money";
import { CurrencyContext } from "../../i18n/currency-context";
import { LocaleProvider, useI18n } from "../../i18n/locale";
import { tableEndpoint } from "../../lib/api";
import "../../styles.css";
import { CurrencyProvider } from "./currency-provider";
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
  const controls = useContext(CurrencyContext);
  return (
    <>
      <button
        type="button"
        onClick={() => controls.setCurrency?.("AUD", controls.getContext?.().revision)}
      >
        エージェントでAUD
      </button>
      <button type="button" onClick={() => controls.setCurrency?.("USD", 0)}>
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
      <span className="text-lg font-semibold">
        <Money value={1000} taxIncluded />
      </span>
      <section aria-label="価格の増減">
        <PriceChange value={80} />
        <PriceChange value={-20} />
      </section>
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
  await page.getByRole("combobox", { name: /通貨|currency/i }).click();
  await page.getByRole("option", { name: new RegExp(code) }).click();
}

it("円を主表示に保ち、通貨の選択後は言語連動と再取得を行わない", async () => {
  await mount();
  await expect.element(page.getByText("¥1,000", { exact: true })).toBeVisible();
  const amount = page.getByText("¥1,000", { exact: true }).element();
  const tax = page.getByText("(税込)", { exact: true }).first().element();
  expect(getComputedStyle(tax).fontSize).toBe(getComputedStyle(amount).fontSize);
  expect(getComputedStyle(tax).fontWeight).toBe(getComputedStyle(amount).fontWeight);
  expect(tax.getBoundingClientRect().bottom).toBeCloseTo(amount.getBoundingClientRect().bottom, 0);
  await page.getByRole("combobox", { name: /通貨|currency/i }).click();
  await expect
    .element(page.getByText("外貨は目安です。お支払いは日本円となります。"))
    .toBeVisible();
  await expect.element(page.getByText("A$ AUD · オーストラリア ドル")).toBeVisible();
  await page.getByRole("option", { name: /AUD/ }).click();
  await expect.element(page.getByText("≈ A$9.67", { exact: true })).toBeVisible();
  const changes = page.getByRole("region", { name: "価格の増減", exact: true }).element().children;
  expect(changes).toHaveLength(2);
  const [increase, decrease] = Array.from(changes);
  if (!increase || !decrease) throw new Error("追加料金と割引の表示が必要です");
  expect(getComputedStyle(increase).color).not.toBe(getComputedStyle(decrease).color);
  for (const change of changes) {
    const color = getComputedStyle(change).color;
    for (const text of change.querySelectorAll("span")) {
      expect(getComputedStyle(text).color).toBe(color);
    }
    const estimate = change.querySelector("[aria-label]");
    if (!estimate) throw new Error("補助通貨の表示が必要です");
    expect(getComputedStyle(estimate).opacity).toBe("0.75");
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect
    .element(page.getByText(en.price_tax_included, { exact: true }).first())
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("A$ AUD");
  await select("GBP");
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("£ GBP");
  await select("JPY");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("¥ JPY");
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("visibilitychange"));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("未操作なら言語に連動し、最初から英語の場合もUSDを表示する", async () => {
  await mount("tablecast-currency-english", "en");
  await expect.element(page.getByText("≈ US$6.50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("¥ JPY");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("US$ USD");
});

it("同じ来店で復元し、新しい来店では前の客の通貨を引き継がない", async () => {
  await mount();
  await select("AUD");
  await expect.element(page.getByText("≈ A$9.67", { exact: true })).toBeVisible();
  await cleanup();
  await mount();
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("A$ AUD");
  await cleanup();
  await mount("tablecast-next-visit");
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("¥ JPY");
});

it("エージェントから表示を変更し、遅れた指示では現在の選択を上書きしない", async () => {
  await mount();
  await page.getByRole("button", { name: "エージェントでAUD" }).click();
  await expect.element(page.getByText("≈ A$9.67", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "遅着したUSD" }).click();
  await expect
    .element(page.getByRole("combobox", { name: /通貨|currency/i }))
    .toHaveTextContent("A$ AUD");
});

it("取得失敗時も円の金額と通貨選択を維持し、参考額を捏造しない", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: { code: "DISPLAY_RATES_UNAVAILABLE" } }), { status: 503 }),
  );
  await mount();
  await select("AUD");
  await expect.element(page.getByText("¥1,000", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: /通貨|currency/i }).click();
  await expect.element(page.getByText("参考レートを取得できません").last()).toBeVisible();
  expect(document.body.textContent).not.toContain("≈ A$");
  expect(fetch).toHaveBeenCalledTimes(1);
});
