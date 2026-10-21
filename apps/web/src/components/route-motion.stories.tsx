import type { Meta, StoryObj } from "@storybook/tanstack-react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouter,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { Package, MessageSquare } from "lucide-react";
import { expect, userEvent } from "storybook/test";
import { useI18n } from "../i18n/locale";
import { routeMotionDirection, supportsPageTransition } from "../lib/route-motion";
import { RouteMotion } from "./route-motion";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

function RouteExampleShell() {
  const router = useRouter();
  const { locale } = useI18n();
  const english = locale === "en";
  return (
    <div className="max-w-3xl space-y-6 p-6">
      <RouteMotion />
      <nav aria-label={english ? "Store settings" : "店舗設定"} className="flex gap-2">
        {/* StorybookのLink spyでは遷移しないため、実Routerのnavigateを操作する。 */}
        <Button variant="outline" onClick={() => void router.navigate({ href: "/menu" })}>
          <Package aria-hidden />
          {english ? "Menu" : "メニュー"}
        </Button>
        <Button variant="outline" onClick={() => void router.navigate({ href: "/cast" })}>
          <MessageSquare aria-hidden />
          {english ? "Service" : "接客"}
        </Button>
      </nav>
      <main
        data-page-motion
        className="space-y-6 rounded-2xl bg-card p-6 shadow-surface [view-transition-name:tablecast-page]"
      >
        <Outlet />
        <label className="grid gap-2">
          {english ? "Store name" : "店舗名"}
          <Input defaultValue={english ? "Komorebi" : "こもれび"} />
        </label>
      </main>
    </div>
  );
}
function MenuExamplePage() {
  const { locale } = useI18n();
  return (
    <div className="flex items-center gap-4">
      <Package className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">{locale === "en" ? "Menu" : "メニュー"}</h1>
    </div>
  );
}
function ServiceExamplePage() {
  const { locale } = useI18n();
  return (
    <div className="flex items-center gap-4">
      <MessageSquare className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">{locale === "en" ? "Service" : "接客"}</h1>
    </div>
  );
}
function createExampleRouter() {
  const root = createRootRoute({ component: RouteExampleShell });
  const menu = createRoute({
    getParentRoute: () => root,
    path: "/menu",
    component: MenuExamplePage,
  });
  const cast = createRoute({
    getParentRoute: () => root,
    path: "/cast",
    component: ServiceExamplePage,
  });
  return createRouter({
    routeTree: root.addChildren([menu, cast]),
    history: createMemoryHistory({ initialEntries: ["/menu"] }),
    defaultViewTransition: supportsPageTransition()
      ? {
          types: (event) => {
            const direction = routeMotionDirection(event);
            return direction ? [direction < 0 ? "tablecast-back" : "tablecast-forward"] : false;
          },
        }
      : false,
  });
}

/** 実際のRouterと本文surfaceを接続し、入力を保持したページ切り替えを確認する。 */
function RouteMotionExample() {
  const router = useMemo(() => createExampleRouter(), []);
  return <RouterProvider router={router} />;
}

const meta = {
  title: "デザインシステム/ページ遷移",
  component: RouteMotionExample,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "既存の本文だけを200msで切り替え、ナビゲーションと入力のDOMを維持する。対応ブラウザーは描画snapshot、未対応はMotionの入場。reduced motionでは即時切り替える。",
      },
    },
  },
} satisfies Meta<typeof RouteMotionExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  play: async ({ canvas }) => {
    const input = await canvas.findByRole("textbox", { name: "店舗名" });
    await userEvent.clear(input);
    await userEvent.type(input, "四条店");
    await userEvent.click(canvas.getByRole("button", { name: "接客" }));
    await expect(await canvas.findByRole("heading", { name: "接客" })).toBeVisible();
    await expect(input).toHaveValue("四条店");
    await userEvent.click(canvas.getByRole("button", { name: "メニュー" }));
    await expect(await canvas.findByRole("heading", { name: "メニュー" })).toBeVisible();
  },
};
export const 英語: Story = { globals: { locale: "en" } };
