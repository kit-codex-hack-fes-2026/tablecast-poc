import type { JapaneseAllergen, Modifier } from "@tablecast/api/schema";
import type { SeedDietary } from "./food.ts";

export type GroupKey =
  | "broth"
  | "garnish"
  | "ice"
  | "seasoning"
  | "serving"
  | "spice"
  | "temperature"
  | "topping";

export type Group = {
  choices: readonly (readonly [string, string, string, number])[];
  en: string;
  ja: string;
  key: GroupKey;
  kind: Modifier["kind"];
  max: number;
  min: number;
};

export type Food = {
  aliases?: string[];
  category: string;
  contains: JapaneseAllergen[];
  dietary: SeedDietary;
  en: string;
  groups: GroupKey[];
  id: string;
  image: string;
  ingredients: readonly [string, string];
  ja: string;
  price: number;
  speech?: string;
};
