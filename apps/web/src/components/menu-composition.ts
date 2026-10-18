import type { Catalog, MenuSection } from "@tablecast/api/schema";

// 旧テーマは読込時に組版へ投影する。公開済みの内容は書き換えない。
export function menuSections(configuration: Catalog["configuration"]): MenuSection[] {
  if (configuration.appearance?.sections?.length) return configuration.appearance.sections;
  return [
    ...(configuration.appearance?.composition?.masthead?.visible === false
      ? []
      : [{ id: "welcome", kind: "intro" as const }]),
    ...(configuration.banners ?? [])
      .filter((banner) => banner.enabled)
      .map((banner, index) => ({
        id: `artwork-${index}`,
        kind: "artwork" as const,
        bannerId: banner.id,
      })),
    ...(configuration.categories.length <= 26 ? configuration.categories : []).map(
      (category, index) => ({
        id: `category-${index}`,
        kind: "products" as const,
        source: { kind: "category" as const, categoryId: category.id },
        layout: "list" as const,
      }),
    ),
    ...(configuration.categories.length && configuration.categories.length <= 26
      ? []
      : [
          {
            id: "all-products",
            kind: "products" as const,
            source: { kind: "all" as const },
            layout: "list" as const,
          },
        ]),
  ];
}
