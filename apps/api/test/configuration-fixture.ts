import { configurationSchema, type Configuration } from "../src/schema";

export const text = (ja: string, en: string) => ({
  ja: { displayName: ja, speechName: ja, description: `${ja}の説明`, aliases: [] },
  en: { displayName: en, speechName: en, description: `${en} description`, aliases: [] },
});
const allergens = {
  contains: [] as string[],
  evidence: "unknown" as const,
  crossContact: "unknown" as const,
  vegan: "unknown" as const,
  note: { ja: "スタッフにご確認ください", en: "Please ask a member of staff" },
};
export const configuration: Configuration = configurationSchema.parse({
  categories: [{ id: "drinks", text: text("飲み物", "Drinks") }],
  products: [
    {
      id: "tea",
      categoryId: "drinks",
      text: text("ほうじ茶", "Roasted green tea"),
      price: 400,
      available: true,
      allergens,
    },
    {
      id: "coffee",
      categoryId: "drinks",
      text: text("カフェラテ", "Caffè latte"),
      price: 500,
      available: true,
      allergens,
      modifiers: [
        {
          id: "milk",
          text: text("ミルク", "Milk"),
          kind: "single",
          min: 1,
          max: 1,
          options: [
            { id: "dairy", text: text("牛乳", "Dairy milk"), priceDelta: 0, available: true },
            { id: "oat", text: text("オーツミルク", "Oat milk"), priceDelta: 100, available: true },
          ],
        },
      ],
    },
  ],
  plans: [],
  cast: {
    instructions: { ja: "丁寧な接客", en: "Polite service" },
    voice: { ja: null, en: null },
    proactive: false,
  },
});
