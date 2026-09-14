import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider, useI18n } from "../../i18n/locale";
import { PaymentForm } from "./payment-form";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import "../../styles.css";

let client: QueryClient;
let requests: unknown[];
let unexpected: string[];
beforeEach(() => {
  requests = [];
  unexpected = [];
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !==
        "/api/admin/stores/tablecast-store/tables/tablecast-session/payments"
    ) {
      unexpected.push(request.url);
      return new Response(null, { status: 500 });
    }
    requests.push(await request.json());
    return Response.json({});
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale(locale === "ja" ? "en" : "ja")}>
      日本語 / English
    </button>
  );
}

describe.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)("$localeの会計入力", ({ locale, labels }) => {
  beforeEach(async () => {
    await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <main className="max-w-2xl space-y-5 p-8">
            <LanguageSwitch />
            <PaymentForm storeId="tablecast-store" sessionId="tablecast-session" />
          </main>
        </LocaleProvider>
      </QueryClientProvider>,
    );
  });

  it("空欄には必須入力を案内し、言語切替と入力修正を反映する", async () => {
    await page.getByRole("button", { name: labels.admin_payment, exact: true }).click();
    const amount = page.getByRole("spinbutton", { name: labels.admin_amount });
    await expect.element(amount).toHaveAttribute("aria-invalid", "true");
    await expect.element(amount).toHaveAccessibleDescription(labels.form_required);
    await expect
      .element(page.getByRole("textbox", { name: labels.admin_reason }))
      .toHaveAccessibleDescription(labels.form_required);
    expect(requests).toHaveLength(0);
    await page.screenshot({
      path: `../../../test-results/browser/tablecast-payment-required-${locale}.png`,
    });
    await page.getByRole("button", { name: "日本語 / English" }).click();
    const next = locale === "ja" ? en : ja;
    await expect
      .element(page.getByRole("spinbutton", { name: next.admin_amount }))
      .toHaveAccessibleDescription(next.form_required);
    await page.getByRole("spinbutton").fill("720");
    await page.getByRole("textbox", { name: next.admin_reason }).fill("店頭受領");
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await page.getByRole("button", { name: next.admin_payment, exact: true }).click();
    await expect.element(page.getByRole("spinbutton")).toHaveValue(null);
    expect(requests).toHaveLength(1);
    expect(requests).toMatchObject([{ amount: 720, kind: "payment", reason: "店頭受領" }]);
  });

  it.each([
    { kind: "payment", value: "0" },
    { kind: "payment", value: "-1" },
    { kind: "payment", value: "1.5" },
    { kind: "adjustment", value: "1.5" },
    { kind: "adjustment", value: "" },
  ] as const)("$kindの金額$valueを拒否して送信しない", async ({ kind, value }) => {
    const action = kind === "payment" ? labels.admin_payment : labels.admin_adjustment;
    await page.getByRole("radio", { name: action, exact: true }).click();
    await page.getByRole("spinbutton").fill(value);
    await page.getByRole("textbox", { name: labels.admin_reason }).fill("確認用");
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect.element(page.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true");
    await expect.element(page.getByRole("alert")).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  it.each([-100, 100])("整数の調整額%iを送信できる", async (amount) => {
    await page.getByRole("radio", { name: labels.admin_adjustment, exact: true }).click();
    await page.getByRole("spinbutton").fill(String(amount));
    await page.getByRole("textbox", { name: labels.admin_reason }).fill("会計調整");
    await page.getByRole("button", { name: labels.admin_adjustment, exact: true }).click();
    await expect.element(page.getByRole("spinbutton")).toHaveValue(null);
    expect(requests).toHaveLength(1);
    expect(requests).toMatchObject([{ amount, kind: "adjustment", reason: "会計調整" }]);
  });
});
