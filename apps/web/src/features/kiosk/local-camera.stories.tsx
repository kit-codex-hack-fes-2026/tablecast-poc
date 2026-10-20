import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { LocalCameraFrame } from "./local-camera";
const meta = {
  title: "客画面/常設カメラ",
  component: LocalCameraFrame,
  decorators: [
    (Story) => (
      <div className="w-60 p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocalCameraFrame>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Off: Story = {};
export const English: Story = { globals: { locale: "en" } };
