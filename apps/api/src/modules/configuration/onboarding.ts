import type { Configuration } from "./model";
import { configurationErrors } from "../catalog/pricing";
import { lintStoreSkills } from "./knowledge-files";

/** GUIとMCPで現在値を照合し、設定先と人が確認する事項を共有する。 */
export function storeOnboarding(
  configuration: Configuration,
  storeId: string,
  version: number,
  draftId?: string,
) {
  const skills = configuration.cast.skills ?? [];
  const issues = lintStoreSkills(skills);
  const errors = configurationErrors(configuration);
  const root = `/admin/stores/${encodeURIComponent(storeId)}`;
  const menu = `${root}/menu${draftId ? `/changes/${encodeURIComponent(draftId)}` : ""}`;
  const steps = [
    {
      id: "identity",
      status: configuration.storeName ? "configured" : "review",
      count: configuration.languages.length,
      href: `${menu}/products`,
      tools: ["get_configuration", "update_draft"],
    },
    {
      id: "menu",
      status:
        configuration.categories.length && configuration.products.length ? "configured" : "missing",
      count: configuration.products.length,
      href: `${menu}/products`,
      tools: ["get_configuration", "upload_image", "update_draft"],
    },
    {
      id: "options",
      status: "review",
      count:
        configuration.products.reduce((sum, product) => sum + product.modifiers.length, 0) +
        configuration.plans.length,
      href: `${menu}/plans`,
      tools: ["get_configuration", "update_draft"],
    },
    {
      id: "appearance",
      status: configuration.branding || configuration.appearance ? "configured" : "review",
      count: configuration.banners?.length ?? 0,
      href: `${root}/design${draftId ? `?draftId=${encodeURIComponent(draftId)}` : ""}`,
      tools: ["get_theme_spec", "upload_image", "update_draft"],
    },
    {
      id: "cast",
      status: "review",
      count: Object.keys(configuration.cast.instructions).length,
      href: `${menu}/cast`,
      tools: ["list_voices", "update_draft"],
    },
    {
      id: "knowledge",
      status: !skills.length
        ? "missing"
        : issues.some((issue) => issue.severity === "error")
          ? "invalid"
          : "configured",
      count: skills.length,
      href: `${menu}/cast/settings#knowledge`,
      tools: [
        "list_store_skills",
        "read_store_skill_file",
        "edit_store_skill",
        "upload_image",
        "import_store_skills",
        "export_store_skills",
        "lint_store_skills",
      ],
    },
    {
      id: "rewards",
      status: "review",
      count: null,
      href: `${root}/points`,
      tools: ["get_point_policy", "set_point_policy", "list_coupon_rules", "save_coupon_rule"],
    },
    {
      id: "games",
      status: "optional",
      count: null,
      href: `${root}/games`,
      tools: ["list_games", "get_game_spec", "register_game", "validate_game"],
    },
    {
      id: "publication",
      status: errors.length ? "invalid" : "review",
      count: errors.length,
      href: draftId ? menu : `${root}/menu/changes`,
      tools: ["validate_draft", "get_draft_diff", "request_publication"],
    },
  ] as const;
  return {
    storeId,
    version,
    draftId: draftId ?? null,
    steps,
    issues: issues.slice(0, 50),
    totalIssues: issues.length,
    errors: errors.slice(0, 50),
    totalErrors: errors.length,
    humanSteps: ["oauth", "credentials", "devices", "publication"] as const,
  };
}
