import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { CurrencyContext } from "../i18n/currency-context";
import { Money } from "./money";

const meta = { title: "共通表示/金額", component: Money, args: { value: 1000 } } satisfies Meta<
  typeof Money
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const YenOnly: Story = { name: "日本円のみ" };
export const AustralianDollar: Story = {
  name: "円を主表示・豪ドルを補助表示",
  decorators: [
    (Story) => (
      <CurrencyContext.Provider
        value={{
          currency: "AUD",
          rates: {
            base: "JPY",
            date: "2026-10-22",
            source: "currency-api",
            rates: { AUD: 0.00967 },
          },
        }}
      >
        <Story />
      </CurrencyContext.Provider>
    ),
  ],
};
export const Unavailable: Story = {
  name: "レート取得不可でも円を表示",
  decorators: [
    (Story) => (
      <CurrencyContext.Provider value={{ currency: "AUD" }}>
        <Story />
      </CurrencyContext.Provider>
    ),
  ],
};
