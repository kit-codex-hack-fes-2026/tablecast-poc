import {
  BookOpenCheck,
  Palette,
  Puzzle,
  Radio,
  ShieldCheck,
  Sparkles,
  Tags,
  UtensilsCrossed,
} from "lucide-react";
export const onboardingLabels = {
  identity: ["onboarding_identity", "onboarding_identity_hint", Tags],
  menu: ["onboarding_menu", "onboarding_menu_hint", UtensilsCrossed],
  options: ["onboarding_options", "onboarding_options_hint", Tags],
  appearance: ["onboarding_appearance", "onboarding_appearance_hint", Palette],
  cast: ["onboarding_cast", "onboarding_cast_hint", Radio],
  knowledge: ["knowledge_title", "onboarding_knowledge_hint", BookOpenCheck],
  rewards: ["onboarding_rewards", "onboarding_rewards_hint", Sparkles],
  games: ["onboarding_games", "onboarding_games_hint", Puzzle],
  publication: ["onboarding_publication", "onboarding_publication_hint", ShieldCheck],
} as const;
export const onboardingStatuses = {
  configured: "onboarding_configured",
  invalid: "onboarding_invalid",
  missing: "onboarding_missing",
  optional: "onboarding_optional",
  review: "onboarding_review",
} as const;
