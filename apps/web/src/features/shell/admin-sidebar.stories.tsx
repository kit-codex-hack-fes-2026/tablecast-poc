import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../../components/ui/button";
import { useConfigurationRoute } from "../configuration/configuration-route";
import { MenuNavigation } from "../configuration/menu-navigation";
import { useSidebarStore } from "../store/sidebar-selection";
import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";

function ConnectedSidebar(props: AdminSidebarProps) {
  const selection = useSidebarStore(props);
  const { draftId } = useConfigurationRoute();
  return (
    <AdminSidebar
      {...props}
      selection={selection}
      renderMenuNavigation={({ collapsed, onNavigate }) =>
        selection.selectedStore ? (
          <MenuNavigation
            storeId={selection.selectedStore}
            manager={selection.manager}
            draftId={draftId}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ) : undefined
      }
    />
  );
}

function StoreChangeExample(props: AdminSidebarProps) {
  const [storeId, setStoreId] = useState("tablecast-first");
  return (
    <>
      <ConnectedSidebar {...props} storeId={storeId} />
      <Button onClick={() => setStoreId("tablecast-second")}>店舗情報を更新</Button>
    </>
  );
}

const meta = {
  title: "店舗/ナビゲーション",
  component: ConnectedSidebar,
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    tab: "live",
    storeId: "tablecast-story",
    onSignOut: fn(),
    signingOut: false,
  },
} satisfies Meta<typeof ConnectedSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = { name: "日本語の店舗操作" };
export const English: Story = {
  name: "英語の店舗操作",
  tags: ["!test"],
  globals: { locale: "en" },
};
export const 店舗情報の更新後もメニューを開いたまま保つ: Story = {
  render: (args) => <StoreChangeExample {...args} />,
  play: async ({ canvasElement }) => {
    // Given: メニューを展開したサイドバー。
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "メニュー・接客" });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // When: 後から確定した店舗情報を反映する。
    await userEvent.click(canvas.getByRole("button", { name: "店舗情報を更新" }));
    // Then: 開閉状態と子ページへの操作を維持する。
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(async () => {
      await expect(canvas.getByRole("navigation", { name: "メニュー・接客" })).toBeVisible();
    });
    await expect(canvas.getByRole("link", { name: "カテゴリ" })).toHaveAttribute(
      "href",
      "/admin/stores/tablecast-second/menu/categories",
    );
  },
};
