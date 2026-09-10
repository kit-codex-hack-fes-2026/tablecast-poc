import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, fn, userEvent, within } from "storybook/test";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";

function StoreChangeExample(props: AdminSidebarProps) {
  const [storeId, setStoreId] = useState("tablecast-first");
  return (
    <>
      <AdminSidebar {...props} storeId={storeId} />
      <Button onClick={() => setStoreId("tablecast-second")}>店舗情報を更新</Button>
    </>
  );
}

const meta = {
  title: "店舗/ナビゲーション",
  component: AdminSidebar,
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RouterProvider
          router={createRouter({
            routeTree: createRootRoute({ component: Story }),
            history: createMemoryHistory({ initialEntries: ["/"] }),
          })}
        />
      </QueryClientProvider>
    ),
  ],
  args: {
    tab: "live",
    storeId: "tablecast-story",
    onSignOut: fn(),
    signingOut: false,
  },
} satisfies Meta<typeof AdminSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = { name: "日本語の店舗操作" };
export const English: Story = { name: "英語の店舗操作", globals: { locale: "en" } };
export const 店舗情報の更新後もメニューを開いたまま保つ: Story = {
  render: (args) => <StoreChangeExample {...args} />,
  play: async ({ canvasElement }) => {
    // Given: メニューを展開したサイドバー。
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "メニュー・接客" });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // When: 後から確定した店舗情報を反映する。
    await userEvent.click(canvas.getByRole("button", { name: "店舗情報を更新" }));
    // Then: 開閉状態と子ページへの操作を維持する。
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByRole("navigation", { name: "メニュー・接客" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "カテゴリ" })).toHaveAttribute(
      "href",
      "/admin/stores/tablecast-second/menu/categories",
    );
  },
};
