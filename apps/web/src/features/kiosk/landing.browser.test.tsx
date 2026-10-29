import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { Landing } from "./landing";

let initialViewport: { height: number; width: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  await cleanup();
  await page.viewport(initialViewport.width, initialViewport.height);
});

test.each([320, 390, 1280])(
  "%i pxのLPで3つのアプリを選び日英とキーボード操作を使える",
  async (width) => {
    await page.viewport(width, 900);
    const root = createRootRoute();
    const landing = createRoute({ getParentRoute: () => root, path: "/", component: Landing });
    const management = createRoute({
      getParentRoute: () => root,
      path: "/admin/live",
      component: () => null,
    });
    const router = createRouter({
      routeTree: root.addChildren([landing, management]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await render(
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>,
    );
    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent(ja.landing_title.replace("\n", " "));
    const hero = page.getByRole("region", { name: ja.landing_title.replace("\n", " ") });
    for (const [name, href] of [
      [ja.landing_app_store_action, "/admin/live"],
      [ja.landing_app_terminal_action, "/pair"],
      [ja.landing_app_member_action, "/member"],
    ]) {
      await expect
        .element(hero.getByRole("link", { name, exact: true }))
        .toHaveAttribute("href", href);
    }
    expect(document.querySelector("iframe")).toBeNull();
    for (const image of hero.element().querySelectorAll("[data-device] img")) {
      const bounds = image.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(900);
    }
    expect(hero.element().querySelectorAll("[data-device] img")).toHaveLength(3);

    await expect
      .element(page.getByRole("banner").getByRole("link", { name: ja.auth_sign_in, exact: true }))
      .toHaveAttribute("href", "/login");
    await expect
      .element(hero.getByRole("img", { name: ja.landing_products_image_alt }))
      .toBeVisible();
    for (const alt of [
      ja.landing_scene_consult_alt,
      ja.landing_case_tourists_alt,
      ja.landing_case_elderly_alt,
      ja.landing_case_setup_alt,
      ja.landing_case_handoff_alt,
    ]) {
      await expect.element(page.getByRole("img", { name: alt })).toBeInTheDocument();
    }
    await expect
      .element(page.getByRole("heading", { name: ja.landing_operations_title.replace("\n", " ") }))
      .toBeVisible();
    const question = page.getByText(new RegExp(ja.landing_faq_confirmation));
    question.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByText(ja.landing_faq_confirmation_answer)).toBeVisible();
    await expect.element(page.getByRole("button", { name: ja.pair_begin })).not.toBeInTheDocument();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent(en.landing_title);
    await expect
      .element(page.getByRole("contentinfo").getByRole("link", { name: en.help_title }))
      .toHaveAttribute("href", "/help/en");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const storeApp = page
      .getByRole("region", { name: en.landing_title })
      .getByRole("link", { name: en.landing_app_store_action, exact: true });
    storeApp.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => router.state.location.pathname).toBe("/admin/live");
  },
);
