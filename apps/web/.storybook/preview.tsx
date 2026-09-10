import { MotionProvider } from "../src/components/motion-provider";
import type { Preview } from "@storybook/react-vite";
import { LocaleProvider } from "../src/i18n/locale";
import "../src/styles.css";

const preview: Preview = {
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
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
