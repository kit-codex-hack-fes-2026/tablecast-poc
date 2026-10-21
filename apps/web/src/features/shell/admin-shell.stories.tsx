import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { StoreAdminShell } from "../store/admin-shell";

function ShellPage() {
  const { locale, t } = useI18n();
  return (
    <StoreAdminShell tab="settings" storeId="tablecast-story" storeName="こもれび">
      <h1 className="text-2xl font-semibold">{t("store_profile")}</h1>
      <label className="grid max-w-lg gap-2">
        {locale === "ja" ? "店舗名" : "Store name"}
        <Input defaultValue={locale === "ja" ? "こもれび" : "Komorebi"} />
      </label>
    </StoreAdminShell>
  );
}

function SidebarLayoutExample() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }),
  );
  const [router] = useState(() => {
    client.setQueryData(["tablecast-session"], {
      user: {
        id: "tablecast-story-user",
        name: "店舗スタッフ",
        email: "restaurant.staff@example.com",
        image: null,
      },
    });
    client.setQueryData(["tablecast-stores"], {
      stores: [
        {
          id: "tablecast-story",
          name: "こもれび",
          logo: null,
          role: "owner",
          organizationId: "tablecast-story-org",
        },
      ],
    });
    const root = createRootRoute();
    const profile = createRoute({
      getParentRoute: () => root,
      path: "/admin/stores/$storeId/profile",
      component: ShellPage,
    });
    return createRouter({
      routeTree: root.addChildren([profile]),
      history: createMemoryHistory({ initialEntries: ["/admin/stores/tablecast-story/profile"] }),
    });
  });
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "店舗/シェル",
  component: SidebarLayoutExample,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "幅の切替、グループ開閉、縮小時のTooltip、編集中の入力保持を同じシェルで確認する。幅変更は既存ResizablePanelが所有し、ドラッグは即時、ボタン操作は200msで切り替える。",
      },
    },
  },
} satisfies Meta<typeof SidebarLayoutExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = { name: "幅切替と入力保持" };
export const English: Story = { name: "英語の幅切替と入力保持", globals: { locale: "en" } };
