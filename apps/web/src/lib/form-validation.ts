import type { Locale } from "@tablecast/api/schema";
import type { z } from "zod";
import { en, ja } from "zod/locales";
const locales = { ja: ja().localeError, en: en().localeError };

// Zodの標準翻訳をparseごとに指定し、SSRの要求間で言語を共有しない。
export const zodFieldValidator =
  (schema: z.ZodType, locale: Locale, formatMessage?: string) =>
  ({ value }: { value: unknown }) =>
    schema.safeParse(value, {
      error: (issue) =>
        issue.code === "invalid_format" && formatMessage ? formatMessage : locales[locale](issue),
    }).error?.issues;
