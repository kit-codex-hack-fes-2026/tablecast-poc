import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { LocaleProvider, useI18n } from "../i18n/locale";
import { DocumentHead } from "./document-head";

// Vitestのホスト文書のtitleはアプリの所有外。SSRでは加工せず重複を検査する。
let hostTitles: HTMLTitleElement[] = [];
beforeEach(() => {
  hostTitles = [...document.head.querySelectorAll("title")];
  hostTitles.forEach((title) => title.remove());
});
afterEach(async () => {
  await cleanup();
  hostTitles.forEach((title) => document.head.appendChild(title));
});

function Layout() {
  const { setLocale } = useI18n();
  return (
    <>
      <HeadContent />
      <DocumentHead />
      <button onClick={() => setLocale("en")}>English</button>
      <Link to="/account">Account</Link>
      <Outlet />
    </>
  );
}

it("画面・店舗・言語変更へheadが追従し、404や親の失敗へ前の対象名を残さない", async () => {
  let loads = 0;
  const root = createRootRoute({
    component: Layout,
    head: () => ({ meta: [{ name: "viewport", content: "width=device-width" }] }),
    notFoundComponent: () => <h1>Not found</h1>,
  });
  const product = createRoute({
    getParentRoute: () => root,
    path: "/product/$itemId",
    staticData: { document: { title: "editor_products", description: "head_catalog_description" } },
    loader: () => {
      loads++;
      return { document: { name: { ja: "柚子ソーダ", en: "Yuzu soda" }, store: "こもれび" } };
    },
    component: () => <h1>Product</h1>,
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: "/account",
    staticData: { document: { title: "account_title", description: "head_account_description" } },
    component: () => <h1>Account</h1>,
  });
  const failedParent = createRoute({
    getParentRoute: () => root,
    path: "/failed",
    beforeLoad: () => {
      throw new Error("取得に失敗しました");
    },
    errorComponent: () => <h1>Unavailable</h1>,
  });
  const failedChild = createRoute({
    getParentRoute: () => failedParent,
    path: "/child",
    staticData: { document: { title: "account_title", description: "head_account_description" } },
  });
  const router = createRouter({
    routeTree: root.addChildren([product, account, failedParent.addChildren([failedChild])]),
    history: createMemoryHistory({ initialEntries: ["/product/internal-secret-id"] }),
  });
  await router.load();
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <RouterProvider router={router} />
    </LocaleProvider>,
  );
  await expect.poll(() => document.title).toBe("柚子ソーダ · 商品 · こもれび · TableCast");
  expect(document.head.querySelectorAll("title")).toHaveLength(1);
  expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
  expect(
    document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
  ).toContain("こもれび");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect.poll(() => document.title).toBe("Yuzu soda · Products · こもれび · TableCast");
  expect(loads).toBe(1);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect.poll(() => document.title).toBe("Account · TableCast");
  expect(
    document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
  ).not.toContain("こもれび");
  expect(document.head.textContent).not.toContain("internal-secret-id");
  await router.navigate({ href: "/missing-page" });
  await expect.poll(() => document.title).toBe("Page not found · TableCast");
  expect(document.head.querySelectorAll("title")).toHaveLength(1);
  await router.navigate({ href: "/failed/child" });
  await expect.poll(() => document.title).toBe("Page unavailable · TableCast");
  expect(document.head.textContent).not.toContain("こもれび");
});
