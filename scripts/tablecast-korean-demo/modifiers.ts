import type { Modifier, Product } from "@tablecast/api/schema";
import { demoOptionImageKey } from "../tablecast-demo-option-images.ts";
import { koreanDemoStoreId } from "./menu.ts";

export function text(
  ja: string,
  en: string,
  descriptionJa = "",
  descriptionEn = "",
): Product["text"] {
  return {
    ja: { displayName: ja, speechName: ja, description: descriptionJa, aliases: [ja] },
    en: {
      displayName: en,
      speechName: en,
      description: descriptionEn,
      aliases: [en.toLowerCase()],
    },
  };
}

type Choice = readonly [string, string, string, number];

function group(
  key: string,
  ja: string,
  en: string,
  choices: Choice[],
  kind: Modifier["kind"] = "single",
  min = 1,
  max = 1,
): Modifier {
  return {
    id: `${koreanDemoStoreId}-${key}`,
    text: text(ja, en),
    kind,
    min,
    max,
    options: choices.map(([id, optionJa, optionEn, priceDelta]) => ({
      id: `${koreanDemoStoreId}-${key}-${id}`,
      text: text(optionJa, optionEn),
      priceDelta,
      available: true,
      imageKey: demoOptionImageKey(`${koreanDemoStoreId}-${key}-${id}`),
      imageKind: "illustration",
      maxQuantity: kind === "quantity" ? 2 : 1,
      requires: [],
      excludes: [],
    })),
  };
}

export const koreanDemoModifierGroups: Record<string, Modifier> = {
  spice: group("spice", "辛さ", "Chilli level", [
    ["mild", "控えめ・辛味あり", "Milder, still contains chilli", 0],
    ["standard", "通常", "Standard", 0],
    ["hot", "辛め", "Hotter", 0],
  ]),
  rice: group("rice", "ご飯を追加", "Add rice", [
    ["none", "追加なし", "No extra rice", 0],
    ["small", "小ご飯", "Small rice", 150],
    ["regular", "ご飯", "Regular rice", 200],
  ]),
  wraps: group("wraps", "包み野菜", "Wrapping leaves", [
    ["lettuce", "サンチュ六枚", "Six lettuce leaves", 0],
    ["mixed", "サンチュ三枚とえごま三枚", "Three lettuce and three perilla leaves", 100],
    ["extra", "サンチュ十枚", "Ten lettuce leaves", 150],
  ]),
  ssamjang: group("ssamjang", "みそだれ", "Ssamjang", [
    ["side", "別添え", "On the side", 0],
    ["none", "みそだれなし", "No ssamjang", 0],
  ]),
  "chicken-sauce": group("chicken-sauce", "チキンのソース", "Chicken sauce", [
    ["plain", "ソースなし", "No sauce", 0],
    ["yangnyeom", "甘辛ヤンニョム", "Sweet-spicy yangnyeom", 100],
    ["soy-garlic", "しょうゆガーリック", "Soy and garlic", 100],
    ["honey-mustard", "ハニーマスタード", "Honey mustard", 100],
  ]),
  dip: group("dip", "つけだれ", "Dipping sauce", [
    ["soy-vinegar", "しょうゆ酢だれ", "Soy-vinegar dip", 0],
    ["chilli", "唐辛子入りしょうゆだれ", "Soy-chilli dip", 0],
    ["none", "たれなし", "No dip", 0],
  ]),
  "bibimbap-protein": group("bibimbap-protein", "ビビンバの具", "Bibimbap protein", [
    ["beef", "牛肉", "Beef", 0],
    ["tofu", "豆腐に変更", "Replace with tofu", -100],
    ["none", "牛肉なし", "No beef", -200],
  ]),
  egg: group("egg", "目玉焼き", "Fried egg", [
    ["yes", "あり", "Include egg", 0],
    ["none", "卵なし", "No egg", -80],
  ]),
  vegetables: group(
    "vegetables",
    "抜くナムル",
    "Vegetables to leave out",
    [
      ["spinach", "ほうれん草抜き", "No spinach", 0],
      ["sprouts", "もやし抜き", "No bean sprouts", 0],
      ["mushrooms", "きのこ抜き", "No mushrooms", 0],
    ],
    "multiple",
    0,
    3,
  ),
  "hotpot-extras": group(
    "hotpot-extras",
    "追加トッピング",
    "Extra toppings",
    [
      ["cheese", "チーズ", "Cheese", 150],
      ["rice-cakes", "トック", "Rice cakes", 180],
      ["ramyeon", "ラーメン", "Ramyeon noodles", 200],
    ],
    "quantity",
    0,
    4,
  ),
  noodles: group("noodles", "麺の量", "Noodle portion", [
    ["regular", "通常", "Regular", 0],
    ["large", "大盛り", "Large", 150],
  ]),
  glasses: group("glasses", "取り分け用の器", "Sharing cups", [
    ["two", "二人分", "Two cups", 0],
    ["three", "三人分", "Three cups", 0],
    ["four", "四人分", "Four cups", 0],
  ]),
  "tea-temperature": group("tea-temperature", "温度", "Temperature", [
    ["hot", "温かい", "Hot", 0],
    ["cold", "冷たい", "Cold", 0],
  ]),
  ice: group("ice", "氷", "Ice", [
    ["standard", "通常", "Regular ice", 0],
    ["less", "少なめ", "Less ice", 0],
    ["none", "氷なし", "No ice", 0],
  ]),
  sweetness: group("sweetness", "甘さ", "Sweetness", [
    ["regular", "通常", "Regular", 0],
    ["lighter", "甘さ控えめ・糖分あり", "Less sweet, contains sugar", 0],
  ]),
};
