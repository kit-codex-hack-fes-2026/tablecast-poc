import type { Configuration, Locale } from "@tablecast/api/schema";
import type { z } from "zod";
import { en, ja } from "zod/locales";
import type { useI18n } from "../../i18n/locale";

type Translate = ReturnType<typeof useI18n>["t"];
const labels: Record<string, Parameters<Translate>[0]> = {
  header: "theme_header",
  voice: "theme_voice_presence",
  sections: "theme_sections",
  colours: "theme_basics",
  fonts: "theme_basics",
  assets: "theme_assets",
  parts: "theme_parts",
  customCss: "theme_css",
  branding: "theme_logo",
  banners: "theme_banners",
};
export function designValidationIssues(
  issues: z.core.$ZodIssue[],
  configuration: Configuration,
  locale: Locale,
  t: Translate,
) {
  const localise = locale === "ja" ? ja().localeError : en().localeError;
  return issues.map((issue) => {
    const field = String(issue.path[issue.path[0] === "appearance" ? 1 : 0]);
    let name: string = t(labels[field] ?? "theme_title");
    const index = issue.path[2];
    if (field === "sections" && typeof index === "number") {
      const section = configuration.appearance?.sections?.[index];
      name += ` ${index + 1}${section?.title?.[locale] ? ` · ${section.title[locale]}` : ""}`;
    }
    if (issue.code === "custom") {
      const key =
        issue.path.includes("title") || issue.path.includes("body")
          ? "theme_bilingual_required"
          : field === "customCss"
            ? "theme_css_invalid"
            : "theme_reference_invalid";
      return `${name}: ${t(key)}`;
    }
    const result = localise(
      issue.code === "invalid_format"
        ? { code: "custom", input: undefined }
        : { ...issue, input: undefined },
    );
    return `${name}: ${typeof result === "string" ? result : (result?.message ?? t("common_invalid_input"))}`;
  });
}
