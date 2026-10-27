import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { LocalCamera, LocalCameraFrame, useLocalCamera } from "./local-camera";
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
function CameraReadingDemo() {
  const camera = useLocalCamera();
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <LocalCamera camera={camera} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!camera.stream || camera.phase !== "idle"}
          onClick={() => {
            void camera.capture(new AbortController().signal, 60000);
          }}
        >
          {t("kiosk_tool_capture_camera")}
        </Button>
        <Button disabled={camera.phase === "idle"} onClick={camera.complete}>
          {t("common_close")}
        </Button>
      </div>
    </div>
  );
}
export const Reading: Story = {
  name: "日本語の画像取得と読取り",
  render: () => <CameraReadingDemo />,
};
export const EnglishReading: Story = {
  name: "英語の画像取得と読取り",
  globals: { locale: "en" },
  render: () => <CameraReadingDemo />,
};
