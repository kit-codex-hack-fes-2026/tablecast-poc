import type { Configuration, Locale } from "@tablecast/api/schema";
import { resolveText, uiLocale } from "@tablecast/api/localization";
import { m } from "../../paraglide/messages";
import { type MenuListSearch, type MenuSection } from "../configuration/menu-model";

export type ItemRow = {
  available?: boolean;
  categoryId?: string;
  count?: number;
  duration?: number;
  id: string;
  imageKey?: null | string;
  lastOrder?: string;
  name: string;
  price?: number;
  secondary: string;
  summary?: string;
};

export function menuCollectionRows(
  configuration: Configuration | undefined,
  section: Exclude<MenuSection, "cast">,
  locale: Locale,
): ItemRow[] {
  if (!configuration) return [];
  const categories = new Map(configuration.categories.map((category) => [category.id, category]));
  if (section === "guides")
    return (configuration.guides ?? []).map((item) => ({
      id: item.id,
      name: resolveText(item.text, locale).displayName,
      secondary: resolveText(item.text, locale).description,
      count: item.productIds.length,
    }));
  if (section === "products")
    return configuration.products.map((item) => {
      const category = categories.get(item.categoryId);
      return {
        id: item.id,
        name: resolveText(item.text, locale).displayName,
        secondary: (category ? resolveText(category.text, locale).displayName : undefined) ?? "",
        imageKey: item.imageKey,
        price: item.price,
        available: item.available,
        categoryId: item.categoryId,
      };
    });
  if (section === "categories") {
    const productsByCategory = new Map<string, Configuration["products"]>();
    for (const product of configuration.products) {
      const products = productsByCategory.get(product.categoryId);
      if (products) products.push(product);
      else productsByCategory.set(product.categoryId, [product]);
    }
    return configuration.categories.map((item) => {
      const products = productsByCategory.get(item.id) ?? [];
      return {
        id: item.id,
        name: resolveText(item.text, locale).displayName,
        secondary: resolveText(item.text, locale === "ja" ? "en" : "ja").displayName,
        count: products.length,
        summary: products
          .map((product) => resolveText(product.text, locale).displayName)
          .join(" · "),
      };
    });
  }
  return configuration.plans.map((item) => ({
    id: item.id,
    name: resolveText(item.text, locale).displayName,
    secondary: m.menu_plan_duration(
      { minutes: item.durationMinutes },
      { locale: uiLocale(locale) },
    ),
    lastOrder: m.menu_plan_last_order(
      { minutes: item.lastOrderMinutesBeforeEnd },
      { locale: uiLocale(locale) },
    ),
    price: item.pricePerPerson,
    duration: item.durationMinutes,
    count: configuration.products.filter(
      (product) =>
        item.productIds.includes(product.id) ||
        item.categoryIds.includes(product.categoryId) ||
        product.tags.some((tag) => item.tags.includes(tag)),
    ).length,
    summary: [
      ...configuration.products.flatMap((product) =>
        item.productIds.includes(product.id) ? [resolveText(product.text, locale).displayName] : [],
      ),
      ...configuration.categories.flatMap((category) =>
        item.categoryIds.includes(category.id)
          ? [resolveText(category.text, locale).displayName]
          : [],
      ),
      ...item.tags,
    ].join(" · "),
  }));
}

export function matchesMenuFilters(
  row: ItemRow,
  section: Exclude<MenuSection, "cast">,
  search: MenuListSearch,
) {
  return (
    (section !== "products" || !search.category || row.categoryId === search.category) &&
    (section !== "products" ||
      !search.availability ||
      row.available === (search.availability === "available"))
  );
}
