import type { JapaneseAllergen } from "@tablecast/api/schema";
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

export const allergenEmoji: Record<JapaneseAllergen, string> = {
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
};

export const dietaryReasonLabels = {
  ingredients_confirmed: "food_reason_ingredients_confirmed",
  animal_ingredients: "food_reason_animal_ingredients",
  meat_or_fish: "food_reason_meat_or_fish",
  gluten_ingredients: "food_reason_gluten_ingredients",
  pork_ingredients: "food_reason_pork_ingredients",
  alcohol: "food_reason_alcohol",
  ingredient_origin_unknown: "food_reason_origin_unknown",
  previous_record: "food_reason_previous_record",
} as const;
export const crossContactSourceLabels = {
  shared_equipment: "food_contact_equipment",
  shared_frying_oil: "food_contact_oil",
  shared_production_line: "food_contact_line",
} as const;
export const halalCertificationLabels = {
  certified: "food_certified",
  not_certified: "food_not_certified",
  unknown: "food_certification_unknown",
} as const;
