import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { parseFlatSearch, stringifyFlatSearch } from "../../lib/router-search";
import "../../styles.css";
import { Login } from "./login";
import { PasskeySetup } from "./passkey-setup";

let client: QueryClient;
let unexpected: string[] = [];
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.cookie = "tablecast.last_login_method=; Max-Age=0; Path=/";
  localStorage.removeItem("tablecast_staff_locale");
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
async function show(locale: "en" | "ja", search = "", setup = false) {
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: setup ? "/passkey-setup" : "/login",
    component: setup ? PasskeySetup : Login,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
    history: createMemoryHistory({
      initialEntries: [`${setup ? "/passkey-setup" : "/login"}${search}`],
    }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
function requests(handler: (path: string, request: Request) => Promise<Response> | Response) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/account/auth-config") return Response.json({ googleOneTapClientId: null });
    return handler(path, request);
  });
}
it.each(["ja", "en"] as const)(
  "%s: パスワードなしでメールリンクを送信し、失敗後も入力を保持して再送できる",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    let attempt = 0;
    const bodies: unknown[] = [];
    requests(async (path, request) => {
      if (path !== "/api/auth/sign-in/magic-link") {
        unexpected.push(path);
        return Response.json({}, { status: 500 });
      }
      bodies.push(await request.json());
      attempt++;
      return attempt === 1
        ? Response.json({ message: "EMAIL_DELIVERY_FAILED" }, { status: 503 })
        : Response.json({ status: true });
    });
    await show(locale, "?returnTo=%2Finvitations%2Fsample");
    expect(document.querySelector('input[type="password"]')).toBeNull();
    const email = page.getByRole("textbox", { name: labels.auth_email, exact: true });
    await email.fill("staff@example.test");
    await page.getByRole("button", { name: labels.auth_send_magic_link, exact: true }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent(labels.account_failed);
    await expect.element(email).toHaveValue("staff@example.test");
    await page.getByRole("button", { name: labels.auth_send_magic_link, exact: true }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent(labels.auth_magic_sent);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({
      email: "staff@example.test",
      metadata: { locale },
      callbackURL: `${window.location.origin}/invitations/sample`,
    });
  },
);
it("Google・パスキー・区切り線・メールの順に並び、前回の方法をキーボードで選べる", async () => {
  requests((path) => {
    unexpected.push(path);
    return Response.json({}, { status: 500 });
  });
  document.cookie = "tablecast.last_login_method=passkey; Path=/";
  await show("ja");
  const passkey = page.getByRole("button", {
    name: new RegExp(`${ja.auth_passkey}.*${ja.auth_last_used}`),
  });
  await expect.element(passkey).toBeVisible();
  expect(passkey.element().querySelector("svg")).not.toBeNull();
  const google = page.getByRole("button", { name: ja.auth_google, exact: true }).element();
  const divider = page.getByRole("separator").element();
  const email = page.getByRole("textbox", { name: ja.auth_email, exact: true }).element();
  for (const [before, after] of [
    [google, passkey.element()],
    [passkey.element(), divider],
    [divider, email],
  ] as const)
    expect(Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
  expect(document.body.textContent).not.toContain(ja.auth_passkey_description);
  await expect
    .element(page.getByRole("button", { name: ja.auth_send_magic_link, exact: true }))
    .toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
  for (let i = 0; i < 8 && passkey.element() !== document.activeElement; i++)
    await userEvent.keyboard("{Tab}");
  await expect.element(passkey).toHaveFocus();
});
it("パスキー登録をキャンセルすると必須登録画面に留まり再試行を案内する", async () => {
  requests((path) => {
    if (path === "/api/auth/passkey/generate-register-options")
      return Response.json({ message: "CANCELLED" }, { status: 400 });
    unexpected.push(path);
    return Response.json({}, { status: 500 });
  });
  await show("ja", "?returnTo=%2Finvitations%2Fsample", true);
  await page.getByRole("button", { name: ja.account_add_passkey, exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.auth_passkey_setup_failed);
  await expect
    .element(page.getByRole("button", { name: ja.account_add_passkey, exact: true }))
    .toBeEnabled();
  await expect.element(page.getByText(ja.auth_passkey_supported_device)).toBeVisible();
});
