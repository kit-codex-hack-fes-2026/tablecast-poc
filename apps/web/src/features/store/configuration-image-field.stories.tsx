import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { fn } from "storybook/test";
import { ConfigurationImageField } from "./configuration-image-field";

const meta = {
  title: "店舗/設定画像",
  component: ConfigurationImageField,
  args: {
    storeId: "tablecast-story",
    value: { imageKey: null, imageKind: "illustration" },
    disabled: false,
    onChange: fn(),
  },
  render: function Render(args) {
    const [client] = useState(() => new QueryClient());
    const [value, setValue] = useState(args.value);
    return (
      <QueryClientProvider client={client}>
        <div className="mx-auto max-w-xl p-6">
          <ConfigurationImageField {...args} value={value} onChange={setValue} />
        </div>
      </QueryClientProvider>
    );
  },
} satisfies Meta<typeof ConfigurationImageField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { name: "画像なし" };
export const ReadFailure: Story = {
  name: "参照先の読込失敗",
  args: {
    value: {
      imageKey: "tablecast/missing.webp",
      imageKind: "illustration",
      imageSource: { generated: true, description: "店舗が利用を許可した生成イメージ" },
    },
  },
};
export const English: Story = { name: "英語の画像入力", globals: { locale: "en" } };
