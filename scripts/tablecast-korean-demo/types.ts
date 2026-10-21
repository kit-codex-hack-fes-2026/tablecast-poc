export type KoreanMenuItem = {
  available?: boolean;
  category: string;
  contains: string[];
  en: string;
  groups: string[];
  hotVessel?: boolean;
  ingredients: readonly [string, string];
  ja: string;
  key: string;
  photo: string;
  price: number;
  spice: "medium" | "mild" | "none";
  tabletop?: boolean;
};
