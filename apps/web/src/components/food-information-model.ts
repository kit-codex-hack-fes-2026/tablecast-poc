export const dietaryLabels = {
  vegan: "food_vegan",
  vegetarian: "food_vegetarian",
  halal: "food_halal",
  glutenFree: "food_gluten_free",
} as const;
export const foodStatusLabels = {
  contains: "food_contains",
  not_used: "food_not_used",
  unknown: "editor_unknown",
  yes: "food_yes",
  no: "food_no",
  possible: "editor_possible",
  controlled: "editor_controlled",
} as const;

export const otherAllergenLabels: Partial<
  Record<
    string,
    | "kiosk_allergen_barley"
    | "kiosk_allergen_crustaceans"
    | "kiosk_allergen_fish"
    | "kiosk_allergen_molluscs"
    | "kiosk_allergen_mustard"
  >
> = {
  fish: "kiosk_allergen_fish",
  mustard: "kiosk_allergen_mustard",
  barley: "kiosk_allergen_barley",
  crustaceans: "kiosk_allergen_crustaceans",
  molluscs: "kiosk_allergen_molluscs",
};

export const allergenEmoji: Record<string, string> = {
  prawn: "🦐",
  cashew: "🥜",
  crab: "🦀",
  walnut: "🌰",
  wheat: "🌾",
  buckwheat: "🍜",
  egg: "🥚",
  milk: "🥛",
  peanuts: "🥜",
  almond: "🌰",
  abalone: "🐚",
  squid: "🦑",
  salmonRoe: "🐟",
  orange: "🍊",
  kiwi: "🥝",
  beef: "🐄",
  sesame: "⚪",
  salmon: "🐟",
  mackerel: "🐟",
  soya: "🫘",
  chicken: "🐓",
  banana: "🍌",
  pistachio: "🥜",
  pork: "🐖",
  macadamia: "🌰",
  peach: "🍑",
  yam: "🍠",
  apple: "🍎",
  gelatin: "🍮",
  fish: "🐟",
  mustard: "🌼",
  barley: "🌾",
  crustaceans: "🦐",
  molluscs: "🐚",
};
