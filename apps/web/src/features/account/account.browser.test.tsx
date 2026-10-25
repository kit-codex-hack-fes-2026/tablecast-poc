import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { parseFlatSearch, stringifyFlatSearch } from "../../lib/router-search";
import "../../styles.css";
import { Account } from "./account";
import { accountSearchSchema } from "./account-model";
import { accountKeysOptions, accountLinksOptions, accountSessionsOptions } from "./account-query";

const session = {
  user: {
    id: "tablecast-user",
    name: "保存前の名前",
    email: "staff@example.test",
    emailVerified: true,
    image: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  session: {
    id: "tablecast-session",
    token: "tablecast-test-session",
    userId: "tablecast-user",
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ipAddress: null,
    userAgent: null,
  },
};
let client: QueryClient;
let unexpected: string[];
let initialViewport: { height: number; width: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

async function show(
  locale: "en" | "ja",
  handle: (request: Request) => Promise<Response | undefined>,
) {
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(["tablecast-session"], structuredClone(session));
  client.setQueryData(["tablecast-stores"], { stores: [] });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const handled = await handle(request);
    if (handled) return handled;
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (path === "/api/account/auth-state") return Response.json(session);
    if (
      [
        "/api/auth/list-sessions",
        "/api/auth/list-accounts",
        "/api/auth/passkey/list-user-passkeys",
      ].includes(path)
    )
      return Response.json([]);
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  const root = createRootRoute();
  const account = createRoute({
    getParentRoute: () => root,
    path: "/account",
    validateSearch: accountSearchSchema,
    component: Account,
  });
  const router = createRouter({
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
    routeTree: root.addChildren([account]),
    history: createMemoryHistory({ initialEntries: ["/account"] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}

it.each([
  { name: "横向き", width: 1024, height: 768 },
  { name: "縦向き", width: 768, height: 1024 },
])("$nameのアカウント取得中も枠を保ち、完了後に入力できる", async ({ width, height }) => {
  const locale = "ja";
  const labels = ja;
  const release = Promise.withResolvers<Response>();
  const reached = Promise.withResolvers<void>();
  await page.viewport(width, height);
  try {
    await show(locale, async (request) => {
      if (new URL(request.url).pathname !== "/api/auth/list-sessions") return undefined;
      reached.resolve();
      return release.promise;
    });
    await reached.promise;
    const name = page.getByLabelText(labels.account_name, { exact: true });
    await expect.element(name).toBeDisabled();
    const heading = page.getByRole("heading", { name: labels.account_title, exact: true });
    const before = heading.element().getBoundingClientRect();
    release.resolve(Response.json([]));
    await expect.element(name).toBeEnabled();
    const after = heading.element().getBoundingClientRect();
    expect({ x: after.x, y: after.y, width: after.width, height: after.height }).toEqual({
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
    });
    await name.fill("入力途中の名前");
    await expect.element(name).toHaveValue("入力途中の名前");
  } finally {
    release.resolve(Response.json([]));
  }
});

it("名前を保存中は入力を止め、保存後の背景取得が失敗しても次の入力を残す", async () => {
  const saving = Promise.withResolvers<void>();
  const saveReached = Promise.withResolvers<void>();
  const refetch = Promise.withResolvers<Response>();
  const refetchReached = Promise.withResolvers<void>();
  let saved = false;
  const payloads: unknown[] = [];
  const requests: string[] = [];
  try {
    await show("ja", async (request) => {
      const path = new URL(request.url).pathname;
      requests.push(path);
      if (path === "/api/auth/update-user") {
        payloads.push(await request.json());
        saveReached.resolve();
        await saving.promise;
        saved = true;
        return Response.json({ status: true });
      }
      if (path === "/api/account/auth-state" && saved)
        return Response.json({ ...session, user: { ...session.user, name: "保存する名前" } });
      if (path === "/api/auth/list-sessions" && saved) {
        refetchReached.resolve();
        return refetch.promise;
      }
      return undefined;
    });
    const name = page.getByLabelText(ja.account_name, { exact: true });
    await expect.element(name).toBeEnabled();
    await name.fill("保存する名前");
    await page.getByRole("button", { name: ja.account_save, exact: true }).click();
    await saveReached.promise;
    await expect.element(name).toBeDisabled();
    saving.resolve();
    await refetchReached.promise;
    await expect
      .element(page.getByRole("status").filter({ hasText: ja.account_saved }))
      .toBeVisible();
    await expect.element(name).toBeEnabled();
    await name.fill("入力途中の名前");
    refetch.resolve(
      Response.json({ code: "UNAVAILABLE", message: "Unavailable" }, { status: 503 }),
    );
    const loginSessions = page.getByRole("region", { name: ja.account_sessions, exact: true });
    await expect.element(loginSessions.getByRole("alert")).toBeVisible();
    await expect
      .element(loginSessions.getByRole("button", { name: ja.common_retry, exact: true }))
      .toBeEnabled();
    await expect.element(name).toBeEnabled();
    await expect.element(name).toHaveValue("入力途中の名前");
    expect(payloads).toEqual([{ name: "保存する名前" }]);
    expect(requests.filter((path) => path === "/api/account/auth-state")).toHaveLength(1);
    expect(
      requests.filter((path) => path === "/api/admin/initial" || path === "/api/admin/stores"),
    ).toEqual([]);
    expect(client.getQueryData(["tablecast-session"])).toMatchObject({
      user: { name: "保存する名前" },
    });
    for (const options of [accountSessionsOptions, accountLinksOptions, accountKeysOptions])
      expect(client.getQueryState(options.queryKey)?.data).toEqual([]);
  } finally {
    saving.resolve();
    refetch.resolve(Response.json([]));
  }
});

it("複数のアカウント一覧の検索と並べ替えをURLで分離し、リセットで他の一覧を変えない", async () => {
  const router = await show("ja", async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/list-accounts")
      return Response.json([
        {
          id: "tablecast-google",
          providerId: "google",
          accountId: "tablecast-provider",
          userId: "tablecast-user",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ]);
    if (path === "/api/auth/passkey/list-user-passkeys")
      return Response.json([
        {
          id: "tablecast-passkey",
          name: "MacBook",
          userId: "tablecast-user",
          publicKey: "test",
          credentialID: "test",
          counter: 0,
          deviceType: "singleDevice",
          backedUp: false,
          createdAt: new Date(0),
        },
      ]);
    return undefined;
  });
  await page.getByRole("searchbox", { name: "接続先を検索" }).fill("Google");
  await page.getByRole("searchbox", { name: "パスキー名で検索" }).fill("MacBook");
  const passkeys = page.getByRole("region", { name: "パスキー", exact: true });
  await passkeys.getByRole("combobox", { name: "並べ替え" }).click();
  await page.getByRole("option", { name: "パスキーの名前 · 降順", exact: true }).click();
  await expect
    .poll(() => new URLSearchParams(router.state.location.searchStr).get("passkeysSort"))
    .toBe("name:desc");
  await passkeys.getByRole("button", { name: "リセット", exact: true }).click();
  await expect.element(page.getByRole("searchbox", { name: "接続先を検索" })).toHaveValue("Google");
  await expect.element(page.getByRole("searchbox", { name: "パスキー名で検索" })).toHaveValue("");
  expect(new URLSearchParams(router.state.location.searchStr).get("passkeysSort")).toBeNull();
  router.history.back();
  await expect
    .element(page.getByRole("searchbox", { name: "パスキー名で検索" }))
    .toHaveValue("MacBook");
  await expect
    .element(passkeys.getByRole("combobox", { name: "並べ替え" }))
    .toHaveTextContent("パスキーの名前 · 降順");
});
