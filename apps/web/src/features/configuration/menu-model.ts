import type { Configuration } from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import { localeSchema, unknownFoodProfile } from "@tablecast/api/schema";
import { z } from "zod";
import { collectionSearchFields, collectionSearchSchema } from "../shell/collection-model";
import { emptyText } from "./configuration-defaults";
export const menuSectionSchema = z.enum(["products", "categories", "plans", "guides", "cast"]);
export const menuListSearchSchema = z.object({
  ...collectionSearchSchema.shape,
  ...collectionSearchFields("options"),
  category: z.string().optional().catch(undefined),
  availability: z.enum(["available", "sold-out"]).optional().catch(undefined),
});
export const menuReviewSearchSchema = menuListSearchSchema.extend({
  returnSection: menuSectionSchema.optional().catch(undefined),
});
export type MenuReviewSearch = z.infer<typeof menuReviewSearchSchema>;
export type MenuListSearch = z.infer<typeof menuListSearchSchema>;
export const emptyMenuListSearch: MenuListSearch = {};
export type MenuSection = z.infer<typeof menuSectionSchema>;
export const menuLabels = {
  guides: "assistance_guides",
  products: "editor_products",
  categories: "editor_categories",
  plans: "editor_plans",
  cast: "editor_cast",
} as const;
/** 取得済みの公開版・下書きから表示名だけをheadへ渡す。内部IDは表示しない。 */
export function menuDocument(configuration: Configuration, section: MenuSection, itemId?: string) {
  const item =
    section !== "cast" && itemId
      ? (configuration[section] ?? []).find((candidate) => candidate.id === itemId)
      : undefined;
  return {
    title: menuLabels[section],
    name: item
      ? { ja: item.text.ja.displayName, en: resolveText(item.text, "en").displayName }
      : undefined,
  };
}

export function addMenuItem(
  configuration: Configuration,
  section: MenuSection,
  id: string,
): Configuration {
  if (section === "guides")
    return {
      ...configuration,
      guides: [
        ...(configuration.guides ?? []),
        { id, text: emptyText(), productIds: [], links: [] },
      ],
    };
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
          foodInfo: { base: unknownFoodProfile(), components: [], defaultComponentIds: [] },
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

export type CastTarget =
  | "proactive"
  | `instructions-${string}`
  | `opening-${string}`
  | `system-${string}`
  | `voice-${string}`;

export function parseCastTarget(value: string): CastTarget | undefined {
  if (value === "proactive") return value;
  const match = /^(system|instructions|opening|voice)-(.+)$/.exec(value);
  const language = localeSchema.safeParse(match?.[2]);
  const prefix = match?.[1];
  if (!prefix || !language.success) return undefined;
  switch (prefix) {
    case "system":
      return `system-${language.data}`;
    case "instructions":
      return `instructions-${language.data}`;
    case "opening":
      return `opening-${language.data}`;
    case "voice":
      return `voice-${language.data}`;
    default:
      return undefined;
  }
}

export function findMenuItem(configuration: Configuration, section: MenuSection, itemId: string) {
  if (section === "cast") return undefined;
  return configuration[section]?.find((item) => item.id === itemId);
}
