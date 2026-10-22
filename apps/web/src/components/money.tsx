import { convertedAmount, foreignMoney } from "@tablecast/api/currency-display";
import { useContext } from "react";
import { CurrencyContext } from "../i18n/currency-context";
import { money } from "../i18n/format";
import { useI18n } from "../i18n/locale";

/** 円は常に主表示。外貨は選択中で取得済みレートがあるときだけ添える。 */
export function Money({ value }: { value: number }) {
  const { locale, t } = useI18n();
  const { currency, rates } = useContext(CurrencyContext);
  const rate = currency ? rates?.rates[currency] : undefined;
  const estimate =
    currency && rate
      ? foreignMoney(convertedAmount(value, currency, rate), currency, locale)
      : undefined;
  return (
    <span className="inline-flex min-w-0 flex-col align-middle tabular-nums">
      <span>{money(value, locale)}</span>
      {estimate && (
        <span
          className="text-xs font-normal leading-normal text-muted-foreground"
          aria-label={`${t("currency_approximate")}: ${estimate}`}
        >
          ≈ {estimate}
        </span>
      )}
    </span>
  );
}
