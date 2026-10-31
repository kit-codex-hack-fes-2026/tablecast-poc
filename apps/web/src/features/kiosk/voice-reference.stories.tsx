import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, within } from "storybook/test";
import { VoiceReferenceCard } from "./voice-reference";
const meta = {
  title: "客向け/参考情報",
  component: VoiceReferenceCard,
  decorators: [
    (Story) => (
      <div className="w-48">
        <Story />
      </div>
    ),
  ],
  args: {
    reference: {
      url: "https://www.bbcgoodfood.com/howto/guide/how-make-tea",
      title: "How to make tea",
      description: "Explore the different ways to prepare a cup of tea.",
    },
  },
} satisfies Meta<typeof VoiceReferenceCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {
  name: "日本語のQR参考カード",
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "How to make tea" }),
    ).toBeVisible();
  },
};
export const English: Story = { name: "英語のQR参考カード", globals: { locale: "en" } };
