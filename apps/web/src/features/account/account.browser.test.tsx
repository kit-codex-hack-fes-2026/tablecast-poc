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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { Account } from "./account";
import { accountKeysOptions, accountLinksOptions, accountSessionsOptions } from "./account-query";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import "../../styles.css";

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
let initialViewport: { width: number; height: number };
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
  locale: "ja" | "en",
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
    if (path === "/api/auth/get-session") return Response.json(session);
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
  const account = createRoute({ getParentRoute: () => root, path: "/account", component: Account });
  const router = createRouter({
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
}

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeのアカウント取得中も枠を保ち、完了後に入力できる",
  async ({ locale, labels }) => {
    const release = Promise.withResolvers<Response>();
    const reached = Promise.withResolvers<void>();
    await page.viewport(locale === "ja" ? 1024 : 768, locale === "ja" ? 768 : 1024);
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
  },
);

it("名前を保存中は入力を止め、保存後の背景取得が失敗しても次の入力を残す", async () => {
  const saving = Promise.withResolvers<void>();
  const saveReached = Promise.withResolvers<void>();
  const refetch = Promise.withResolvers<Response>();
  const refetchReached = Promise.withResolvers<void>();
  let saved = false;
  const payloads: unknown[] = [];
  try {
    await show("ja", async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/auth/update-user") {
        payloads.push(await request.json());
        saveReached.resolve();
        await saving.promise;
        saved = true;
        return Response.json({ status: true });
      }
      if (path === "/api/auth/get-session" && saved)
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
    await expect.element(page.getByRole("alert")).toBeVisible();
    await expect.element(name).toHaveValue("入力途中の名前");
    expect(payloads).toEqual([{ name: "保存する名前" }]);
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
