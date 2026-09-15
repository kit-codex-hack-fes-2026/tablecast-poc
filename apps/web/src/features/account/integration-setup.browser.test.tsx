import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider } from "../../i18n/locale";
import { IntegrationSetup } from "./integration-setup";
import { integrationConnection } from "./integration-query";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import "../../styles.css";

// 認証済みの枠だけを省略し、案内・翻訳・コピー値は実物を検査する。
vi.mock("../shell/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => (
    <main className="mx-auto max-w-4xl space-y-6 p-8">{children}</main>
  ),
}));
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

test.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)("$localeのstaging接続案内に現在のURLと専用名を表示する", async ({ locale, labels }) => {
  await page.viewport(1280, 1100);
  const connection = integrationConnection("https://tablecast-staging.kit-codex.workers.dev");
  function Guide() {
    return <IntegrationSetup mode="manual" connection={connection} />;
  }
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "/", component: Guide });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await render(
    <LocaleProvider initialLocale={locale} persist={false}>
      <RouterProvider router={router} />
    </LocaleProvider>,
  );
  await expect.element(page.getByText(labels.mcp_staging_connection)).toBeVisible();
  await expect
    .element(page.getByText("codex mcp add tablecast-staging", { exact: false }))
    .toHaveTextContent("https://tablecast-staging.kit-codex.workers.dev/mcp");
  await expect
    .element(page.getByText("codex mcp login tablecast-staging", { exact: false }))
    .toHaveTextContent("tablecast:read,tablecast:write");
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  for (const [label, prompt] of [
    [labels.mcp_scenario_setup, labels.mcp_prompt_setup],
    [labels.mcp_scenario_advisor, labels.mcp_prompt_advisor],
    [labels.mcp_scenario_analytics, labels.mcp_prompt_analytics],
  ]) {
    await expect
      .element(page.getByRole("textbox", { name: label, exact: true }))
      .toHaveValue(prompt);
    await page
      .getByRole("button", { name: `${label}: ${labels.common_copy}`, exact: true })
      .click();
    expect(copy).toHaveBeenLastCalledWith(prompt);
  }
  for (const [label, name] of [
    [labels.mcp_skill_download, "tablecast"],
    [labels.mcp_skill_advisor_download, "tablecast-advisor"],
    [labels.mcp_skill_analytics_download, "tablecast-analytics"],
  ]) {
    const link = page.getByRole("link", { name: label, exact: true });
    await expect.element(link).toHaveAttribute("download", "SKILL.md");
    const href = link.element().getAttribute("href");
    if (!href) throw new Error("ダウンロード先がありません");
    const content = await (await fetch(href)).text();
    expect(content).toContain(`name: ${name}\n`);
    expect(content).toContain("get_configuration");
  }
  const scenarios = page
    .getByRole("heading", { name: labels.mcp_scenarios_title, exact: true })
    .element()
    .closest("section");
  const downloads = page
    .getByRole("heading", { name: "Agent Skills", exact: true })
    .element()
    .closest("section");
  if (!scenarios || !downloads) throw new Error("案内の領域がありません");
  await page
    .elementLocator(scenarios)
    .screenshot({ path: `../../../test-results/browser/tablecast-staging-mcp-${locale}.png` });
  await page
    .elementLocator(downloads)
    .screenshot({ path: `../../../test-results/browser/tablecast-plugin-downloads-${locale}.png` });
  await page.viewport(390, 844);
  await expect
    .element(page.getByRole("textbox", { name: labels.mcp_scenario_setup, exact: true }))
    .toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  await page
    .elementLocator(scenarios)
    .screenshot({ path: `../../../test-results/browser/tablecast-plugin-mobile-${locale}.png` });
});
