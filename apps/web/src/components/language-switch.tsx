import type { Locale } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";
import { FlagSelect } from "./flag-select";
import { gb, jp } from "./flags";

export function LanguageSwitch({
  onChange,
  disabled = false,
}: {
  disabled?: boolean;
  onChange: (locale: Locale) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <FlagSelect
      value={locale}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={t("common_language")}
      options={[
        { value: "ja", flag: jp, label: t("common_language_native_ja") },
        { value: "en", flag: gb, label: t("common_language_native_en") },
      ]}
    />
  );
}
