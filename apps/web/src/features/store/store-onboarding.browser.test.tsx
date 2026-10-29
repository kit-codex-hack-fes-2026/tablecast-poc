import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { type OnboardingData, onboardingOptions } from "./onboarding-query";
import { StoreContext } from "./store-context";
import { StoreOnboarding } from "./store-onboarding";

const storeId = "tablecast-onboarding-store";
const draftId = "tablecast-existing-draft";
const value: OnboardingData = {
  storeId,
  draftId,
  version: 1,
  progress: {
    configured: 3,
    invalid: 0,
    missing: 0,
    optional: 1,
    review: 5,
    total: 8,
    nextStepId: "options",
  },
  steps: [
    {
      id: "identity",
      status: "configured",
      count: 2,
      href: "/products",
      tools: ["get_configuration", "update_draft"],
    },
    {
      id: "menu",
      status: "configured",
      count: 18,
      href: "/products",
      tools: ["get_configuration", "upload_image", "update_draft"],
    },
    {
      id: "options",
      status: "review",
      count: 4,
      href: "/plans",
      tools: ["get_configuration", "update_draft"],
    },
    {
      id: "appearance",
      status: "review",
      count: 0,
      href: "/design",
      tools: ["get_theme_spec", "upload_image", "update_draft"],
    },
    {
      id: "cast",
      status: "review",
      count: 2,
      href: "/cast",
      tools: ["list_voices", "update_draft"],
    },
    {
      id: "knowledge",
      status: "configured",
      count: 1,
      href: "/cast/settings#knowledge",
      tools: [
        "list_store_skills",
        "read_store_skill_file",
        "edit_store_skill",
        "upload_image",
        "import_store_skills",
        "export_store_skills",
        "lint_store_skills",
      ],
    },
    {
      id: "rewards",
      status: "review",
      count: null,
      href: "/points",
      tools: ["get_point_policy", "set_point_policy", "list_coupon_rules", "save_coupon_rule"],
    },
    {
      id: "games",
      status: "optional",
      count: null,
      href: "/games",
      tools: ["list_games", "get_game_spec", "register_game", "validate_game"],
    },
    {
      id: "publication",
      status: "review",
      count: 0,
      href: "/changes",
      tools: ["validate_draft", "get_draft_diff", "request_publication"],
    },
  ],
  issues: [],
  totalIssues: 0,
  errors: [],
  totalErrors: 0,
  humanSteps: ["oauth", "credentials", "devices", "publication"],
};
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(1280, 720);
});

async function mount(locale: "en" | "ja") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(onboardingOptions(storeId, draftId).queryKey, structuredClone(value));
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <StoreContext
          value={{
            id: storeId,
            name: "こもれび",
            logo: null,
            role: "owner",
            organizationId: "tablecast-org",
          }}
        >
          <main className="p-4">
            <Suspense fallback="Loading">
              <StoreOnboarding draftId={draftId} />
            </Suspense>
          </main>
        </StoreContext>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it.each([
  { locale: "ja", width: 1280, copy: ja },
  { locale: "en", width: 390, copy: en },
] as const)(
  "$locale・幅$widthで進捗と9項目の設定先を示し、必要な説明を展開できる",
  async ({ locale, width, copy }) => {
    await page.viewport(width, 1100);
    await mount(locale);
    const bar = page.getByRole("progressbar", { name: copy.onboarding_data_progress });
    await expect.element(bar).toHaveAttribute("aria-valuenow", "3");
    await expect.element(bar).toHaveAttribute("aria-valuemax", "8");
    expect(page.getByRole("link", { name: copy.onboarding_open, exact: true }).all()).toHaveLength(
      9,
    );
    await expect
      .element(page.getByRole("link", { name: copy.onboarding_next, exact: true }))
      .toHaveAttribute("href", "/plans");
    await expect
      .element(page.getByText(copy.onboarding_options_hint, { exact: true }))
      .toBeVisible();
    await page.getByRole("heading", { name: copy.onboarding_menu, exact: true }).click();
    await expect.element(page.getByText(copy.onboarding_menu_hint, { exact: true })).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
);

it("更新失敗でも進捗を保持し、再試行でMCP側の修正と次の設定先を反映する", async () => {
  let fail = true;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    expect(url.pathname).toBe(`/api/admin/stores/${storeId}/onboarding`);
    expect(url.searchParams.get("draftId")).toBe(draftId);
    return Promise.resolve(
      fail
        ? Response.json({ code: "UNAVAILABLE" }, { status: 503 })
        : Response.json({
            ...value,
            version: 2,
            progress: {
              ...value.progress,
              configured: 2,
              invalid: 2,
              review: 4,
              nextStepId: "knowledge",
            },
            steps: value.steps.map((step) =>
              step.id === "knowledge" || step.id === "publication"
                ? { ...step, status: "invalid" }
                : step,
            ),
          }),
    );
  });
  await mount("ja");
  const bar = page.getByRole("progressbar", { name: ja.onboarding_data_progress });
  await page.getByRole("button", { name: ja.onboarding_refresh, exact: true }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(bar).toHaveAttribute("aria-valuenow", "3");
  fail = false;
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await expect.element(bar).toHaveAttribute("aria-valuenow", "2");
  await expect
    .element(page.getByRole("link", { name: ja.onboarding_next, exact: true }))
    .toHaveAttribute("href", "/cast/settings#knowledge");
});
