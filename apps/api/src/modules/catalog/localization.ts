import { z } from "zod";
import { localeSchema, type UiLocale } from "../../platform/model";

/** 日本語を原文として必ず保持し、未翻訳の言語は保存しない。 */
export function localizedSchema<T extends z.ZodType>(value: T) {
  return z
    .object({ ja: value })
    .catchall(value)
    .superRefine((values, context) => {
      for (const key of Object.keys(values)) {
        if (!localeSchema.safeParse(key).success)
          context.addIssue({ code: "custom", path: [key], message: "言語コードが不正です。" });
      }
    });
}

export function resolveLocalized<T>(
  values: { [language: string]: T | undefined; ja: T },
  locale: string,
): T {
  for (const value of [values[locale], values.en, values.ja]) {
    if (value !== undefined && (typeof value !== "string" || value.trim())) return value;
  }
  return values.ja;
}

export function resolveText<
  T extends {
    description: string;
    displayName: string;
    speechName?: string;
    transliteration?: string;
  },
>(values: { [language: string]: T | undefined; ja: T }, locale: string): T {
  const value = resolveLocalized(values, locale);
  return {
    ...value,
    speechName: value.speechName || value.transliteration || value.displayName,
    description:
      [values[locale], values.en, values.ja].find((text) => text?.description.trim())
        ?.description ?? "",
  };
}

/** UI未収録の言語でもコンテンツと音声の言語は変更しない。 */
export function uiLocale(locale: string): UiLocale {
  if (locale === "ja" || locale.startsWith("ja-")) return "ja";
  if (locale === "ko" || locale.startsWith("ko-")) return "ko";
  if (
    locale === "zh" ||
    locale === "zh-Hans" ||
    locale.startsWith("zh-Hans-") ||
    locale === "zh-CN" ||
    locale === "zh-SG"
  )
    return "zh-Hans";
  return "en";
}

export function localizedNames(text: {
  [language: string]:
    | undefined
    | { displayName: string; speechName?: string; transliteration?: string };
  ja: { displayName: string; speechName?: string; transliteration?: string };
}) {
  const names: Record<string, string> & { ja: string } = { ja: text.ja.displayName };
  const speechNames: Record<string, string> & { ja: string } = {
    ja: text.ja.speechName || text.ja.transliteration || text.ja.displayName,
  };
  const transliterations: Record<string, string> & { ja: string } = {
    ja: text.ja.transliteration ?? text.ja.speechName ?? text.ja.displayName,
  };
  for (const [language, value] of Object.entries(text)) {
    if (!value) continue;
    names[language] = value.displayName;
    speechNames[language] = value.speechName || value.transliteration || value.displayName;
    if (value.transliteration) transliterations[language] = value.transliteration;
  }
  return { name: names, speechName: speechNames, transliteration: transliterations };
}

export function mapLocalized<T, R>(
  values: { [language: string]: T | undefined; ja: T },
  map: (value: T) => R,
): { [language: string]: R; ja: R } {
  const output: { [language: string]: R; ja: R } = { ja: map(values.ja) };
  Object.entries(values).forEach(([language, value]) => {
    if (language !== "ja" && value !== undefined) output[language] = map(value);
  });
  return output;
}

export function languageName(locale: string) {
  return locale === "en"
    ? "British English"
    : (new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale);
}
