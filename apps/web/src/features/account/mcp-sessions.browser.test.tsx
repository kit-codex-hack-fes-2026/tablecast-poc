import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import type { authClient } from "../../lib/auth-client";
import { storesOptions } from "../store/store-query";
import { type loadMcpSessions } from "./account-query";
import { McpSessions } from "./mcp-sessions";
import ja from "../../../messages/ja.json";
import "../../styles.css";

let client: QueryClient;
let unexpected: string[] = [];
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

it("MCP連携のscopeと日時を表示し、取消確認を承認した後だけ再取得して行を消す", async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const now = new Date();
  const login: typeof authClient.$Infer.Session = {
    user: {
      id: "tablecast-mcp-user",
      name: "連携検証利用者",
      email: "mcp@example.test",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "tablecast-mcp-login",
      userId: "tablecast-mcp-user",
      token: "tablecast-browser-only-session",
      expiresAt: new Date(now.getTime() + 3600000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  };
  client.setQueryData(sessionOptions.queryKey, login);
  client.setQueryData(storesOptions.queryKey, { stores: [], locale: "ja" });
  let data: Awaited<ReturnType<typeof loadMcpSessions>> = {
    sessions: [
      {
        id: "tablecast-mcp-consent",
        clientName: "TableCast browser acceptance",
        clientId: "tablecast-browser-client",
        storeName: "連携検証店舗",
        scopes: ["tablecast:read", "tablecast:write"],
        status: "active",
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        expiresAt: now.getTime() + 3600000,
        refreshExpiresAt: now.getTime() + 7200000,
      },
    ],
  };
  let revocations = 0;
  unexpected = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === "/api/account/mcp-sessions" && request.method === "GET")
        return Response.json(data);
      if (
        path === "/api/account/mcp-sessions/tablecast-mcp-consent/revoke" &&
        request.method === "POST"
      ) {
        revocations += 1;
        data = { sessions: [] };
        return Response.json({ ok: true });
      }
      unexpected.push(`${request.method} ${path}`);
      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 });
    }),
  );
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/account/mcp-sessions",
    component: McpSessions,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/account/mcp-sessions"] }),
  });
  await router.load();
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  const connection = page.getByRole("row").filter({ hasText: "TableCast browser acceptance" });
  await expect.element(connection).toMatchTextContent("tablecast:read");
  await expect.element(connection).toMatchTextContent("tablecast:write");
  await expect.element(connection).toMatchTextContent(ja.mcp_active);
  await expect
    .element(page.getByRole("columnheader", { name: ja.mcp_refresh_expires }))
    .toBeVisible();
  expect(connection.element().querySelectorAll("time")).toHaveLength(4);
  await connection.getByRole("button", { name: ja.mcp_revoke, exact: true }).click();
  expect(revocations).toBe(0);
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.common_cancel, exact: true })
    .click();
  await expect.element(connection).toBeVisible();
  expect(revocations).toBe(0);
  await connection.getByRole("button", { name: ja.mcp_revoke, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.mcp_revoke, exact: true })
    .click();
  await expect.element(connection).not.toBeInTheDocument();
  expect(revocations).toBe(1);
});
