import { MotionProvider } from "../src/components/motion-provider";
import type { Preview } from "@storybook/tanstack-react";
import { LocaleProvider } from "../src/i18n/locale";
import "../src/styles.css";

const preview: Preview = {
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  // 初回の機能読込がafterEachのアニメーション検出より遅れないようにする。
  beforeAll: async () => {
    await import("../src/components/motion-features");
  },
  // 最終状態のアクセシビリティを検査し、fade途中の文字色を測らない。
  afterEach: async ({ canvasElement }) => {
    await new Promise(requestAnimationFrame);
    const animations = canvasElement.ownerDocument
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running" &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      );
    await Promise.allSettled(animations.map((animation) => animation.finished));
  },
  globalTypes: {
    locale: {
      description: "表示言語",
      toolbar: {
        icon: "globe",
        items: [
          { value: "ja", title: "日本語" },
          { value: "en", title: "English" },
        ],
      },
    },
  },
  initialGlobals: { locale: "ja" },
  decorators: [
    (Story, context) => (
      <LocaleProvider
        key={context.globals.locale === "en" ? "en" : "ja"}
        initialLocale={context.globals.locale === "en" ? "en" : "ja"}
      >
        <MotionProvider>
          <Story />
        </MotionProvider>
      </LocaleProvider>
    ),
  ],
};
export default preview;
