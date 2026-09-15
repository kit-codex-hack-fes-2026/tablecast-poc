import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useI18n } from "../../i18n/locale";
import { VoiceAvatarArtwork } from "./voice-avatar-artwork";

const meta = {
  title: "客向け/接客アバター素材",
  component: VoiceAvatarArtwork,
  decorators: [
    (Story) => {
      const { locale } = useI18n();
      return (
        <figure className="m-4 flex max-w-sm flex-col items-center gap-3">
          <div className="flex h-64 w-full justify-center rounded-3xl bg-linear-to-b from-amber-50/80 to-transparent">
            <Story />
          </div>
          <figcaption className="text-sm text-foreground">
            {locale === "ja" ? "共通の接客アバター" : "Shared service avatar"}
          </figcaption>
        </figure>
      );
    },
  ],
} satisfies Meta<typeof VoiceAvatarArtwork>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "静止した素材" };
export const English: Story = { name: "英語の説明", globals: { locale: "en" } };
