import type { Product } from "@tablecast/api/schema";
import { configurationSchema } from "@tablecast/api/schema";
import { demoImageKey } from "../tablecast-seed-media.ts";
import { koreanDemoMenu, koreanDemoStoreId, koreanDemoStoreName } from "./menu.ts";
import { koreanDemoModifierGroups, text } from "./modifiers.ts";

const commonNote = {
  ja: "架空デモの登録材料です。調味料の全成分・選択変更による成分差・交差接触は未確認です。ハラール、コーシャ等の宗教認証とヴィーガン適合は未確認です。材料名や肉抜きだけで適合を保証せず、スタッフへ確認してください。",
  en: "These are recorded ingredients for a fictional demo. Full condiment ingredients, changes from options and cross-contact are unverified. Halal, kosher and other religious certification, and vegan suitability, are unverified. Ingredients or removing meat do not guarantee suitability; ask staff.",
};

export function koreanDemoStore(profile: "demo" | "history" | "smoke") {
  const featured = ["samgyeopsal", "bibimbap", "fried-chicken", "yuja-tea"];
  const products: Product[] = koreanDemoMenu
    .filter((item) => profile !== "smoke" || featured.includes(item.key))
    .map((item) => {
      const spiceDescription = {
        none: [
          "基本は唐辛子の辛さなし。選ぶソースにより変わります。",
          "No chilli heat by default; selected sauces may change this.",
        ],
        mild: [
          "基本は控えめな刺激があります。辛味なしの保証ではありません。",
          "Mild by default; this is not a promise of no heat.",
        ],
        medium: [
          "基本は唐辛子の辛味があります。控えめを選んでも辛味は残ります。",
          "Contains chilli heat by default; a milder selection still contains chilli.",
        ],
      }[item.spice];
      const spice = ["korean-alcohol", "soft-drinks", "desserts"].includes(item.category)
        ? ["", ""]
        : spiceDescription;
      const safety = item.tabletop
        ? [
            "卓上加熱はスタッフが操作します。肉は中心まで十分に加熱し、生肉用トングと食用を分けます。熱い鉄板や加熱機器に触れず、調整はスタッフを呼んでください。",
            "Staff operate the tabletop heater. Meat must be thoroughly cooked through, with separate raw-meat and eating utensils. Do not touch the hot pan or heater; ask staff to adjust it.",
          ]
        : item.hotVessel
          ? [
              "鍋と出汁は熱くなっています。器に触れず、取り分けや移動はスタッフにご相談ください。",
              "The bowl and broth are hot. Avoid touching the vessel and ask staff for help sharing or moving it.",
            ]
          : ["", ""];
      const description = {
        ja: `${item.ingredients[0]}。${spice[0]}${safety[0]}${commonNote.ja}`,
        en: `${item.ingredients[1]}. ${spice[1]} ${safety[1]} ${commonNote.en}`,
      };
      return {
        id: `${koreanDemoStoreId}-${item.key}`,
        categoryId: item.category,
        text: text(item.ja, item.en, description.ja, description.en),
        price: item.price,
        available: item.available ?? true,
        tags: [
          ...(item.category === "korean-alcohol" ? ["alcohol"] : []),
          ...(item.tabletop ? ["tabletop-cooking"] : []),
        ],
        imageKey: demoImageKey(`hanul-${item.key}.webp`),
        imageKind: "illustration",
        modifiers: item.groups.map((key) => {
          const value = koreanDemoModifierGroups[key];
          if (!value) throw new Error(`韓国店の選択肢がありません: ${key}`);
          return value;
        }),
        allergens: {
          contains: item.contains,
          evidence: "verified",
          crossContact: "unknown",
          vegan: "unknown",
          note: description,
        },
      };
    });
  return {
    id: koreanDemoStoreId,
    name: koreanDemoStoreName,
    tableCount: profile === "smoke" ? 2 : 12,
    configuration: configurationSchema.parse({
      categories: (
        [
          ["grill", "肉料理・卓上焼き", "Meat dishes and table grilling"],
          ["small-plates", "チヂミ・小皿", "Pancakes and small plates"],
          ["rice-noodles", "ご飯・麺", "Rice and noodles"],
          ["soups", "チゲ・スープ", "Stews and soups"],
          ["desserts", "甘いもの", "Desserts"],
          ["korean-alcohol", "韓国のお酒", "Korean drinks with alcohol"],
          ["soft-drinks", "お茶・ノンアルコール", "Tea and non-alcoholic drinks"],
        ] as const
      ).map(([id, ja, en]) => ({ id, text: text(ja, en) })),
      products,
      plans: [
        {
          id: `${koreanDemoStoreId}-tea-selection`,
          text: text(
            "韓国茶と果実ドリンク 飲み放題",
            "Korean tea and fruit drink selection",
            "90分、一人4杯まで。お酒は対象外です。",
            "Ninety minutes, up to four drinks per person. Alcoholic drinks are excluded.",
          ),
          pricePerPerson: 1280,
          durationMinutes: 90,
          lastOrderMinutesBeforeEnd: 20,
          productIds: [],
          categoryIds: ["soft-drinks"],
          tags: [],
          maxPerOrder: 4,
          maxTotalPerPerson: 4,
          intervalSeconds: 60,
          excludedOptionIds: [],
          includedOptionSurcharge: true,
        },
      ],
      cast: {
        instructions: {
          ja: "韓国食堂ハヌル三条店の接客担当です。料理の日本語名と材料、辛さ、取り分けの量を一つずつ説明してください。卓上調理は必ずスタッフが加熱機器を操作し、十分な加熱と熱い器への注意を案内します。辛さ控えめでも辛味は残る商品があります。宗教認証・ヴィーガン適合・交差接触は未確認です。肉抜き、植物性の具材やノンアルコールという名前だけで安全・適合を保証せず、スタッフへつないでください。",
          en: "You host guests at the fictional Hanul Sanjo Korean kitchen. Explain dishes, ingredients, heat and sharing portions one point at a time. Staff must operate tabletop heaters; explain thorough cooking and hot-vessel precautions. Milder dishes may still contain chilli. Religious certification, vegan suitability and cross-contact are unverified. Do not promise safety or suitability from meat removal, plant ingredients or a non-alcoholic name alone; ask staff to help.",
        },
        voice: { ja: null, en: null },
        proactive: false,
      },
    }),
  };
}
