import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { ImageProvider } from "../../components/image-provider";
import { StoreKnowledge } from "./store-knowledge";

const meta = {
  title: "店舗/店舗資料",
  component: StoreKnowledge,
  args: { storeId: catalog.storeId, value: catalog.configuration.cast.skills ?? [] },
  decorators: [
    (Story) => (
      <ImageProvider basePath={`/api/admin/stores/${catalog.storeId}`} assets={catalog.imageAssets}>
        <main className="mx-auto max-w-5xl p-4">
          <Story />
        </main>
      </ImageProvider>
    ),
  ],
} satisfies Meta<typeof StoreKnowledge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Preview: Story = {};
export const Editing: Story = {
  render: function Editing(args) {
    const [skills, setSkills] = useState(args.value);
    return <StoreKnowledge {...args} value={skills} onChange={setSkills} />;
  },
};
export const Empty: Story = { args: { storeId: catalog.storeId, value: [] } };
