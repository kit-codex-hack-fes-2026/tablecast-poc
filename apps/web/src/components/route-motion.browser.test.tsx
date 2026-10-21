import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import "../styles.css";
import { MotionProvider } from "./motion-provider";
import { RouteMotion } from "./route-motion";

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

async function mount(native: boolean) {
  vi.spyOn(window.CSS, "supports").mockReturnValue(native);
  const root = createRootRoute({
    component: () => (
      <MotionProvider>
        <RouteMotion />
        <main data-page-motion className="h-64 overflow-auto">
          <label>
            入力中の商品名
            <input defaultValue="御膳" />
          </label>
          <Outlet />
          <div className="h-96" />
        </main>
      </MotionProvider>
    ),
  });
  const first = createRoute({
    getParentRoute: () => root,
    path: "/menu",
    component: () => <h1>商品</h1>,
  });
  const second = createRoute({
    getParentRoute: () => root,
    path: "/cast",
    component: () => <h1>接客</h1>,
  });
  const demo = createRoute({
    getParentRoute: () => root,
    path: "/demo/$demoId",
    component: () => <h1>接続中</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([first, second, demo]),
    history: createMemoryHistory({ initialEntries: ["/menu"] }),
  });
  await router.load();
  await render(<RouterProvider router={router} />);
  await expect.element(page.getByRole("heading", { name: "商品" })).toBeVisible();
  const surface = document.querySelector<HTMLElement>("[data-page-motion]");
  if (!surface) throw new Error("ページ本文がありません");
  return { router, surface };
}

it("未対応ブラウザーの連続ページ遷移でも入力DOM・focus・scrollを保持する", async () => {
  const { router, surface } = await mount(false);
  // CSSの一時的なtransitionとは分け、fallbackのWAAPI呼出しを検査する。
  const animate = vi.spyOn(surface, "animate");
  const input = page.getByRole("textbox", { name: "入力中の商品名" });
  await input.fill("季節の御膳");
  const original = input.element();
  surface.scrollTop = 64;
  expect(animate).not.toHaveBeenCalled();
  await router.navigate({ href: "/cast" });
  await expect.element(page.getByRole("heading", { name: "接客" })).toBeVisible();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  expect(animate.mock.calls.length > 0).toBe(
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  await router.navigate({ href: "/menu" });
  await expect.element(page.getByRole("heading", { name: "商品" })).toBeVisible();
  expect(input.element()).toBe(original);
  await expect.element(input).toHaveValue("季節の御膳");
  await expect.element(input).toHaveFocus();
  expect(surface.scrollTop).toBe(64);
  await expect.poll(() => getComputedStyle(surface).transform).toBe("none");
  expect(getComputedStyle(surface).opacity).toBe("1");
});

it("検索だけ・接続済みdemoの入退場ではfallbackの画面移動を追加しない", async () => {
  const { router, surface } = await mount(false);
  // CSSの一時的なtransitionとは分け、fallbackのWAAPI呼出しを検査する。
  const animate = vi.spyOn(surface, "animate");
  await router.navigate({ href: "/menu?filter=seasonal" });
  await router.navigate({ href: "/demo/sample" });
  await expect.element(page.getByRole("heading", { name: "接続中" })).toBeVisible();
  await router.navigate({ href: "/menu" });
  await expect.element(page.getByRole("heading", { name: "商品" })).toBeVisible();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  expect(animate).not.toHaveBeenCalled();
  expect(getComputedStyle(surface).transform).toBe("none");
});

it("native対応ブラウザーはfallbackを重ねず通常のRouter描画を維持する", async () => {
  const { router, surface } = await mount(true);
  await router.navigate({ href: "/cast" });
  await expect.element(page.getByRole("heading", { name: "接客" })).toBeVisible();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  expect(surface.getAnimations()).toHaveLength(0);
});
