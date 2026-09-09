import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fn } from "storybook/test";
import { AdminSidebar } from "./admin-sidebar";

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
