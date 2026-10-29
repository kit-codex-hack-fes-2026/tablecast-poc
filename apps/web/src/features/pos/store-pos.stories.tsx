import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { posCatalogOptions, posDevicesOptions } from "./pos-query";
import { StorePosSettings } from "./store-pos";
import { posDevicesFixture } from "./test-support/pos-fixture";
import { posSeedCatalog, posSeedSettings } from "./test-support/pos-seed-fixture";

function createFixtureClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(
    posCatalogOptions("tablecast-store", "tablecast-location").queryKey,
    posSeedCatalog,
  );
  client.setQueryData(
    posDevicesOptions("tablecast-store", "tablecast-location").queryKey,
    posDevicesFixture,
  );
  return client;
}

const ContentContext = createContext<ReactNode>(null);
const fixtureRoute = createRootRoute({ component: FixtureContent });
function FixtureContent() {
  const children = useContext(ContentContext);
  return <main className="space-y-6 p-6">{children}</main>;
}
function Fixture({ children }: { children: ReactNode }) {
  const [client] = useState(createFixtureClient);
  const [router] = useState(() =>
    createRouter({
      routeTree: fixtureRoute,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    }),
  );
  useEffect(() => () => client.clear(), [client]);
  return (
    <ContentContext value={children}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ContentContext>
  );
}
const meta = {
  title: "管理/POS連携設定",
  component: StorePosSettings,
  args: { storeId: "tablecast-store", canEdit: true, settings: posSeedSettings },
  decorators: [
    (Story) => (
      <Fixture>
        <Story />
      </Fixture>
    ),
  ],
} satisfies Meta<typeof StorePosSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {
  name: "接続済みの対応付け",
  play: async ({ canvasElement }) => {
    const logo = within(canvasElement).getByRole("img", { name: "Square" });
    await waitFor(() => expect(logo).toHaveProperty("naturalWidth", 599));
    await expect(logo).toHaveStyle({ height: "24px" });
    await expect(logo).toHaveAttribute("src", "/brand/square-primary-black.svg");
  },
};
export const Published: Story = {
  name: "公開中の対応付けは閲覧のみ",
  args: { settings: { ...posSeedSettings, draft: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const select of canvas.getAllByRole("combobox", { name: /Squareの商品/ }))
      await expect(select).toBeDisabled();
    await expect(canvas.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
  },
};
export const Disconnected: Story = {
  name: "接続前の案内",
  args: { settings: { ...posSeedSettings, connection: null, mappings: [] } },
};
export const Unconfigured: Story = {
  name: "接続の準備待ち",
  args: { settings: { ...posSeedSettings, configured: false, connection: null, mappings: [] } },
};
export const English: Story = {
  name: "英語の連携設定",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("heading", { name: "POS integration" }),
    ).toBeVisible();
  },
};

export const Disconnecting: Story = {
  name: "接続解除の再試行待ち",
  args: {
    settings: {
      ...posSeedSettings,
      connection: posSeedSettings.connection
        ? { ...posSeedSettings.connection, status: "disconnecting" }
        : null,
    },
  },
};
export const DisconnectingEnglish: Story = {
  ...Disconnecting,
  name: "英語の接続解除の再試行待ち",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Disconnecting", { exact: true })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Connect Square" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Disconnect" })).toBeEnabled();
  },
};
