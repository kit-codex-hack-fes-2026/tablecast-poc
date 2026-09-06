import type { Configuration, ConfigurationIssue, Locale } from "@tablecast/api/schema";
import { useI18n } from "../../i18n/locale";

const messages = {
  DUPLICATE_ID: "config_error_duplicate_id",
  CATEGORY_NOT_FOUND: "config_error_category_missing",
  MODIFIER_SELECTION_RANGE: "config_error_selection_range",
  MODIFIER_CAPACITY: "config_error_capacity",
  OPTION_REFERENCE_INVALID: "config_error_option_reference",
  PLAN_LAST_ORDER_INVALID: "config_error_last_order",
  PLAN_TARGET_EMPTY: "config_error_empty_target",
  PRODUCT_NOT_FOUND: "config_error_product_missing",
  OPTION_NOT_FOUND: "config_error_option_missing",
  VOICE_NOT_FOUND: "config_error_voice_missing",
  VOICE_NOT_STANDARD: "config_error_voice_not_standard",
  VOICE_LANGUAGE_MISMATCH: "config_error_voice_language_mismatch",
} as const satisfies Record<ConfigurationIssue["code"], string>;

function subject(configuration: Configuration, path: ConfigurationIssue["path"], locale: Locale) {
  const [collection, index, section, groupIndex, options, optionIndex] = path;
  if (typeof index !== "number") return null;
  if (collection === "categories") return configuration.categories[index]?.text[locale].displayName;
  if (collection === "plans") return configuration.plans[index]?.text[locale].displayName;
  if (collection !== "products") return null;
  const product = configuration.products[index];
  const group =
    section === "modifiers" && typeof groupIndex === "number"
      ? product?.modifiers[groupIndex]
      : undefined;
  const option =
    options === "options" && typeof optionIndex === "number"
      ? group?.options[optionIndex]
      : undefined;
  return [product, group, option]
    .flatMap((item) => (item ? [item.text[locale].displayName] : []))
    .join(" / ");
}

function reference(issue: ConfigurationIssue) {
  switch (issue.code) {
    case "DUPLICATE_ID":
      return issue.params.id;
    case "CATEGORY_NOT_FOUND":
      return issue.params.categoryId;
    case "PRODUCT_NOT_FOUND":
      return issue.params.productId;
    case "OPTION_NOT_FOUND":
      return issue.params.optionId;
    case "OPTION_REFERENCE_INVALID":
      return issue.params.referenceId;
    case "VOICE_NOT_FOUND":
    case "VOICE_NOT_STANDARD":
    case "VOICE_LANGUAGE_MISMATCH":
      return issue.params.voiceId;
    default:
      return null;
  }
}

export function ConfigurationErrors({
  errors,
  configuration,
}: {
  errors: ConfigurationIssue[];
  configuration: Configuration;
}) {
  const { t, locale } = useI18n();
  if (!errors.length) return null;
  return (
    <ul className="text-destructive py-3.5 px-5 text-xs" aria-label={t("config_error_list")}>
      {errors.map((issue, index) => {
        const voiceLocale =
          issue.path[0] === "cast" && issue.path[1] === "voice" ? issue.path[2] : undefined;
        const name =
          voiceLocale === "ja" || voiceLocale === "en"
            ? `${t("editor_voice")} / ${t(voiceLocale === "ja" ? "common_ja" : "common_en")}`
            : subject(configuration, issue.path, locale);
        const id = reference(issue);
        return (
          <li key={JSON.stringify([issue.code, issue.path, index])}>
            {name && <strong>{name}: </strong>}
            {t(messages[issue.code])}
            {id && (
              <>
                {" "}
                (<code>{id}</code>)
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
