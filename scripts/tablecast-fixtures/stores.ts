import type { Configuration, Modifier, Product } from "@tablecast/api/schema";
import { configurationSchema } from "@tablecast/api/schema";
import type { GroupKey } from "./types.ts";
import { demoOptionImageKey } from "../tablecast-demo-option-images.ts";
import { koreanDemoStore } from "../tablecast-korean-demo.ts";
import { demoImageKey, demoStoreBanner, demoStoreLogo } from "../tablecast-seed-media.ts";
import { recipeFoodInformation, seedDietary, withDemoFoodChanges } from "./food.ts";
import { komorebiSkills } from "./komorebi-knowledge.ts";
import { localizeSeedConfiguration } from "./localize.ts";
import { groupDefinitions } from "./modifiers.ts";
import { sakeKinds, sakes } from "./sake.ts";
import { categories, drinks, foods, stores } from "./store-data.ts";
import { bilingual } from "./text.ts";
import { westwardConfiguration } from "./westward.ts";

export function demoStores(profile: "demo" | "history" | "smoke") {
  const seededStores = stores.map((store) => {
    if (store.id === "tablecast-hanul") return koreanDemoStore(profile);
    if (store.id === "tablecast-koharu") {
      return {
        id: store.id,
        name: store.name,
        configuration: westwardConfiguration(store.id, profile),
        tableCount: profile === "smoke" ? 2 : 12,
      };
    }
    const groups: Modifier[] = groupDefinitions.map((group) => ({
      id: `${store.id}-${group.key}`,
      text: bilingual(group.ja, group.en),
      kind: group.kind,
      min: group.min,
      max: group.max,
      options: group.choices.map(([key, ja, en, priceDelta]) => ({
        id: `${store.id}-${group.key}-${key}`,
        text: bilingual(ja, en),
        priceDelta,
        available: !(group.key === "garnish" && key === "shiso"),
        imageKey: demoOptionImageKey(`${store.id}-${group.key}-${key}`),
        imageKind: "illustration",
        maxQuantity: group.kind === "quantity" ? 3 : 1,
        requires: [],
        excludes: [],
      })),
    }));
    const modifiers = (keys: GroupKey[]) =>
      groups.filter((group) => keys.some((key) => group.id === `${store.id}-${key}`));
    const sakeProducts: Product[] = sakes.map(
      ([id, ja, reading, en, kind, notesJa, notesEn, price], index) => {
        const [kindJa, kindEn] = sakeKinds[kind];
        const text = bilingual(
          `${store.label} ${ja} ${kindJa}`,
          `${store.english} ${en} ${kindEn}`,
          `${notesJa}。表示価格は60mlです。`,
          `${notesEn}. The displayed price is for 60ml.`,
        );
        text.ja.speechName = `${store.label} ${reading} ${kindJa}`;
        text.en.speechName = `${store.english} ${en}, ${kindEn}`;
        text.ja.aliases = [reading, `${kindJa} ${index + 1}`];
        text.en.aliases = [en, `${kindEn} sake ${index + 1}`];
        return {
          id: `${store.id}-sake-${id}`,
          categoryId: "sake",
          text,
          price,
          available: index !== 25,
          tags: ["sake", "alcohol", ...(index < 2 ? ["popular"] : [])],
          imageKey: demoImageKey(`komorebi-sake-${id}.webp`),
          imageKind: "illustration",
          modifiers: modifiers(kind === "sparkling" ? ["serving"] : ["temperature", "serving"]),
          foodInfo: recipeFoodInformation([], seedDietary.alcohol, "sake"),
        };
      },
    );
    const otherProducts: Product[] = [...foods, ...drinks].map((item) => {
      const text = bilingual(
        item.ja,
        item.en,
        `${item.ingredients[0]}。`,
        `${item.ingredients[1]}.`,
      );
      text.ja.speechName = item.speech ?? item.ja;
      text.ja.aliases = [
        ...new Set([
          item.speech ?? item.ja,
          ...(item.aliases ?? []),
          item.id === "karaage" ? "からあげ" : item.ja.replaceAll(" ", ""),
        ]),
      ];
      text.en.aliases = [item.en.toLowerCase(), item.id.replaceAll("-", " ")];
      return withDemoFoodChanges({
        id: `${store.id}-${item.id}`,
        categoryId: item.category,
        text,
        price: item.price,
        available: item.id !== "hokke",
        tags: [
          ...(["sashimi", "karaage", "yakitori"].includes(item.id) ? ["popular"] : []),
          ...(drinks.slice(0, 5).some((drink) => drink.id === item.id) ? ["alcohol"] : []),
        ],
        imageKey: demoImageKey(`komorebi-${item.id}.webp`),
        imageKind: "illustration",
        modifiers: modifiers(item.groups),
        foodInfo: recipeFoodInformation(item.contains, item.dietary, item.category),
      });
    });
    const featuredIds = [
      `${store.id}-sake-tsukinagi`,
      `${store.id}-sashimi`,
      `${store.id}-karaage`,
      `${store.id}-edamame`,
    ];
    const products = [...sakeProducts, ...otherProducts]
      .sort((left, right) => {
        const leftIndex = featuredIds.indexOf(left.id);
        const rightIndex = featuredIds.indexOf(right.id);
        return (
          (leftIndex < 0 ? featuredIds.length : leftIndex) -
          (rightIndex < 0 ? featuredIds.length : rightIndex)
        );
      })
      .filter((product) => profile !== "smoke" || featuredIds.includes(product.id));
    const availableOptions = new Set(
      products.flatMap((product) =>
        product.modifiers.flatMap((group) => group.options.map((option) => option.id)),
      ),
    );
    const configuration: Configuration = configurationSchema.parse({
      categories: categories.map(([id, ja, en]) => ({ id, text: bilingual(ja, en) })),
      products,
      plans: [
        {
          id: `${store.id}-drinks`,
          text: bilingual(
            "日本酒とお飲み物 飲み放題",
            "Sake & drinks selection",
            "対象の日本酒と飲料を二時間。大容量の小瓶は対象外です。",
            "Two hours of selected sake and drinks. Carafes are excluded.",
          ),
          pricePerPerson: 3200,
          durationMinutes: 120,
          lastOrderMinutesBeforeEnd: 30,
          productIds: [],
          categoryIds: ["sake", "drinks"],
          tags: [],
          maxPerOrder: 4,
          maxTotalPerPerson: 8,
          intervalSeconds: 60,
          excludedOptionIds: [`${store.id}-serving-carafe`].filter((option) =>
            availableOptions.has(option),
          ),
          includedOptionSurcharge: false,
        },
        {
          id: `${store.id}-plates`,
          text: bilingual(
            "和食の食べ放題",
            "Japanese plates selection",
            "酒の肴と揚げものが対象。追加の温泉卵は対象外です。",
            "Small plates and fried dishes are included. Extra soft-cooked eggs are excluded.",
          ),
          pricePerPerson: 3800,
          durationMinutes: 120,
          lastOrderMinutesBeforeEnd: 30,
          productIds: [],
          categoryIds: ["small-plates", "fried"],
          tags: [],
          maxPerOrder: 6,
          maxTotalPerPerson: 12,
          intervalSeconds: 90,
          excludedOptionIds: [`${store.id}-topping-egg`].filter((option) =>
            availableOptions.has(option),
          ),
          includedOptionSurcharge: true,
        },
        {
          id: `${store.id}-set`,
          text: bilingual(
            "京の三皿コース",
            "Kyoto three-plate course",
            "お造り・唐揚げ・枝豆から一人三品まで選べる定額コースです。同じ料理も一品として数えます。提供順の自動管理はありません。",
            "A fixed-price course of up to three plates per person from sashimi, fried chicken and edamame. Repeated dishes each count as one plate. Serving order is arranged by staff.",
          ),
          pricePerPerson: 2200,
          durationMinutes: 90,
          lastOrderMinutesBeforeEnd: 20,
          productIds: [`${store.id}-sashimi`, `${store.id}-karaage`, `${store.id}-edamame`],
          categoryIds: [],
          tags: [],
          maxPerOrder: 3,
          maxTotalPerPerson: 3,
          intervalSeconds: 0,
          excludedOptionIds: [],
          includedOptionSurcharge: true,
        },
      ],
      cast: {
        skills: komorebiSkills,
        instructions: {
          ja: "和食と多彩な日本酒を、香り・味わい・好みを一つずつ確かめながら丁寧に案内してください。注文確認は正確に読み、原材料や交差接触が不明な場合は安全と断言せずスタッフへ案内してください。",
          en: "Guide guests courteously through Japanese dishes and a varied sake list, asking about aroma, flavour and preferences one at a time. Confirm orders accurately and refer unverified ingredients or cross-contact questions to staff without promising safety.",
        },
        voice: { ja: null, en: null },
        proactive: false,
      },
    });
    return {
      id: store.id,
      name: store.name,
      configuration,
      tableCount: profile === "smoke" ? 2 : 12,
    };
  });
  return seededStores.map((store) => ({
    ...store,
    configuration: configurationSchema.parse({
      ...localizeSeedConfiguration(store.configuration, store.id),
      branding: {
        logo: (() => {
          const image = demoStoreLogo(store.id, store.name);
          return {
            ...image,
            alt: { ...image.alt, "zh-Hans": `${store.name} 标志`, ko: `${store.name} 로고` },
          };
        })(),
        banner: (() => {
          const image = demoStoreBanner(store.id, store.name);
          return {
            ...image,
            alt: { ...image.alt, "zh-Hans": `${store.name} 横幅`, ko: `${store.name} 배너` },
          };
        })(),
      },
    }),
  }));
}
