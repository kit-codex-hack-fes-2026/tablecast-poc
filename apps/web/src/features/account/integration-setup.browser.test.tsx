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
afterEach(cleanup);

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
  await page.screenshot({
    path: `../../../test-results/browser/tablecast-staging-mcp-${locale}.png`,
  });
});
