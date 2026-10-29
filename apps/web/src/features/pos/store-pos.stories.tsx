import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { expect, within } from "storybook/test";
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

function Fixture({ children }: { children: ReactNode }) {
  const [client] = useState(createFixtureClient);
  return (
    <QueryClientProvider client={client}>
      <main className="space-y-6 p-6">{children}</main>
    </QueryClientProvider>
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
export const Connected: Story = { name: "接続済みの対応付け" };
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
