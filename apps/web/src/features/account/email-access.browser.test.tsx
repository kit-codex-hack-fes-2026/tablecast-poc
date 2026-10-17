import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "vitest-browser-react";
import { page, server, userEvent, type Locator } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n/locale";
import { EmailAccess } from "./email-access";
import { Login } from "./login";
import ja from "../../../messages/ja.json";
import "../../styles.css";

let client: QueryClient;
let unexpected: string[] = [];
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
    localStorage.removeItem("tablecast_staff_locale");
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

async function show(locale: "ja" | "en", register = true) {
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: register ? "/register" : "/login",
    component: () => (register ? <EmailAccess register /> : <Login />),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [register ? "/register" : "/login"] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

async function tabTo(control: Locator) {
  const key =
    server.platform === "darwin" && server.browser === "webkit" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
  for (let count = 0; count < 20 && control.element() !== document.activeElement; count++)
    await userEvent.keyboard(key);
  await expect.element(control).toHaveFocus();
}

function enlargeText(scope: Element) {
  // remの余白を変えず、px指定も含めて実際の文字だけを2倍にする
  const sizes = [scope, ...scope.querySelectorAll<HTMLElement>("*")]
    .filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        (element.matches("input, select, textarea") ||
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )),
    )
    .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
  for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
}

async function expectReadableControl(control: Locator) {
  await expect.element(control).toBeVisible();
  const element = control.element();
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const bounds = element.getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
  const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  let node = text.nextNode();
  while (node) {
    if (node.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    node = text.nextNode();
  }
  for (const rect of rects) {
    expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 2);
    expect(rect.right).toBeLessThanOrEqual(bounds.right + 2);
    expect(rect.top).toBeGreaterThanOrEqual(bounds.top - 2);
    expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom + 2);
  }
}

it("日本語の登録は項目エラーでは送信せず、503後も入力を保持して再送できる", async () => {
  const locale = "ja";
  const labels = ja;
  const bodies: unknown[] = [];
  const release = Promise.withResolvers<void>();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname !== "/api/auth/sign-up/email") {
      unexpected.push(request.url);
      return Response.json({}, { status: 500 });
    }
    bodies.push(await request.json());
    if (bodies.length > 1) return Response.json({ user: { id: "tablecast-staff" }, token: null });
    await release.promise;
    return Response.json({ code: "SERVICE_UNAVAILABLE", message: "Unavailable" }, { status: 503 });
  });
  await show(locale);
  const submit = page.getByRole("button", { name: labels.auth_register, exact: true });
  await submit.click();
  const email = page.getByRole("textbox", { name: labels.auth_email, exact: true });
  await expect.element(email).toHaveAttribute("aria-invalid", "true");
  await expect.element(email).toHaveAccessibleDescription(labels.form_email);
  expect(bodies).toEqual([]);
  await page
    .getByRole("textbox", { name: labels.account_name, exact: true })
    .fill("TableCast Staff");
  await email.fill("form@example.test");
  await page.getByLabelText(labels.auth_password, { exact: true }).fill("tablecast-form-password");
  await submit.click();
  try {
    await expect.element(submit).toBeDisabled();
    await expect.element(submit).toHaveAttribute("aria-busy", "true");
  } finally {
    release.resolve();
  }
  await expect.element(page.getByRole("alert")).toHaveTextContent(labels.account_failed);
  await expect.element(email).toHaveValue("form@example.test");
  await expect.element(submit).toBeEnabled();
  await expect
    .element(page.getByLabelText(labels.auth_password, { exact: true }))
    .toHaveValue("tablecast-form-password");
  await expect
    .element(page.getByRole("textbox", { name: labels.account_name, exact: true }))
    .toHaveValue("TableCast Staff");
  await submit.click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0]).toMatchObject({
    name: "TableCast Staff",
    email: "form@example.test",
    password: "tablecast-form-password",
  });
  await expect.element(page.getByText(labels.auth_check_email, { exact: true })).toBeVisible();
  await expect.element(submit).not.toBeInTheDocument();
});

it("日本語のログインは文字を200%にしてもキーボードで送信でき、失敗後も入力を保持する", async () => {
  const locale = "ja";
  const labels = ja;
  const requested = Promise.withResolvers<Request>();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === "/api/auth/sign-in/email") {
      requested.resolve(request);
      return Response.json(
        { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid" },
        { status: 401 },
      );
    }
    unexpected.push(request.url);
    return Response.json({}, { status: 500 });
  });
  await page.viewport(1024, 768);
  await show(locale, false);
  const heading = page.getByRole("heading", { name: labels.auth_subtitle, exact: true });
  const originalSize = Number.parseFloat(getComputedStyle(heading.element()).fontSize);
  enlargeText(page.getByRole("main").element());
  expect(Number.parseFloat(getComputedStyle(heading.element()).fontSize)).toBe(originalSize * 2);
  for (const name of [
    "日本語",
    "English",
    labels.auth_google,
    labels.auth_passkey,
    labels.auth_sign_in,
  ])
    await expectReadableControl(page.getByRole("button", { name, exact: true }));
  const email = page.getByLabelText(labels.auth_email, { exact: true });
  const password = page.getByLabelText(labels.auth_password, { exact: true });
  await expectReadableControl(email);
  await expectReadableControl(password);
  await tabTo(email);
  await userEvent.keyboard("staff@example.test");
  await userEvent.keyboard("{Tab}");
  await expect.element(password).toHaveFocus();
  await userEvent.keyboard("tablecast-login-password");
  await userEvent.keyboard("{Tab}");
  await expect
    .element(page.getByRole("button", { name: labels.auth_sign_in, exact: true }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(await (await requested.promise).json()).toEqual({
    email: "staff@example.test",
    password: "tablecast-login-password",
  });
  await expect.element(page.getByRole("alert")).toHaveTextContent(labels.auth_failed);
  await expect.element(email).toHaveValue("staff@example.test");
  await expect.element(password).toBeEnabled();
});
