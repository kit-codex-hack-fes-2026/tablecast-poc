import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Field } from "@base-ui/react/field";
import { FieldErrors } from "./field-errors";
import { Input } from "./input";
const meta = {
  title: "デザインシステム/部品/FieldErrors",
  component: FieldErrors,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { errors: [] },
} satisfies Meta<typeof FieldErrors>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <Field.Root invalid className="grid max-w-sm gap-2">
      <Field.Label>メールアドレス</Field.Label>
      <Field.Control render={<Input />} defaultValue="invalid" />
      <FieldErrors errors={["有効なメールアドレスを入力してください。"]} />
    </Field.Root>
  ),
};
