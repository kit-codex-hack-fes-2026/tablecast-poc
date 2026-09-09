import type { Configuration } from "@tablecast/api/schema";
import { z } from "zod";
import { emptyText } from "./configuration-defaults";
export const menuSectionSchema = z.enum(["products", "categories", "plans", "cast"]);
export type MenuSection = z.infer<typeof menuSectionSchema>;
export const menuLabels = {
  products: "editor_products",
  categories: "editor_categories",
  plans: "editor_plans",
  cast: "editor_cast",
} as const;
export function addMenuItem(
  configuration: Configuration,
  section: MenuSection,
  id: string,
): Configuration {
  if (section === "products")
    return {
      ...configuration,
      products: [
        ...configuration.products,
        {
          id,
          categoryId: configuration.categories[0]?.id ?? "",
          text: emptyText(),
          price: 0,
          available: false,
          tags: [],
          imageKey: null,
          imageKind: "illustration",
          modifiers: [],
          allergens: {
            contains: [],
            evidence: "unknown",
            crossContact: "unknown",
            vegan: "unknown",
            note: { ja: "", en: "" },
          },
        },
      ],
    };
  if (section === "categories")
    return {
      ...configuration,
      categories: [...configuration.categories, { id, text: emptyText() }],
    };
  if (section === "plans")
    return {
      ...configuration,
      plans: [
        ...configuration.plans,
        {
          id,
          text: emptyText(),
          pricePerPerson: 0,
          durationMinutes: 60,
          lastOrderMinutesBeforeEnd: 10,
          productIds: [],
          categoryIds: [],
          tags: [],
          maxPerOrder: 1,
          maxTotalPerPerson: 1,
          intervalSeconds: 0,
          excludedOptionIds: [],
          includedOptionSurcharge: false,
        },
      ],
    };
  return configuration;
}
