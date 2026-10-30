import type { Food } from "./types.ts";
import { seedDietary } from "./food.ts";
export const rice: Food[] = [
  {
    id: "onigiri",
    ja: "焼きおにぎり 二個",
    en: "Two grilled rice balls",
    price: 460,
    category: "rice",
    image: "onigiri",
    groups: [],
    ingredients: ["ご飯にしょうゆを塗って焼きます", "Rice balls grilled with soy sauce"],
    contains: ["wheat", "soya"],
    dietary: seedDietary.plantGluten,
  },
  {
    id: "ochazuke",
    ja: "さけの出汁茶漬け",
    en: "Salmon rice with dashi broth",
    price: 680,
    category: "rice",
    image: "ochazuke",
    groups: ["broth", "topping"],
    ingredients: [
      "ご飯、焼きざけ、選んだ出汁を合わせます",
      "Rice and grilled salmon with your chosen broth",
    ],
    contains: ["salmon"],
    dietary: seedDietary.fish,
  },
  {
    id: "udon",
    ja: "〆のかけうどん",
    en: "Udon noodles in broth",
    price: 590,
    category: "rice",
    image: "udon",
    groups: ["broth", "topping"],
    ingredients: [
      "小麦のうどんと選んだ出汁を合わせます",
      "Wheat udon noodles in your chosen broth",
    ],
    contains: ["wheat"],
    dietary: seedDietary.plantGluten,
    speech: "しめのかけうどん",
  },
];
