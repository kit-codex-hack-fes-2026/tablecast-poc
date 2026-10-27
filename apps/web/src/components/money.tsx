import { useContext } from "react";
import { CurrencyContext } from "../i18n/currency-context";
import { money } from "../i18n/format";
import { useI18n } from "../i18n/locale";

/** 円は常に主表示。外貨は選択中で取得済みレートがあるときだけ添える。 */
export function Money({ value, signed = false }: { signed?: boolean; value: number }) {
  const { locale, t } = useI18n();
  const { currency, rates } = useContext(CurrencyContext);
  const rate = currency ? rates?.rates[currency] : undefined;
  const sign = signed && value > 0 ? "+" : "";
  const estimate = currency && rate ? `${sign}${money(value * rate, locale, currency)}` : undefined;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span>
        {sign}
        {money(value, locale)}
      </span>
      {estimate && (
        <>
          {" "}
          <span
            className="text-muted-foreground"
            aria-label={`${t("currency_approximate")}: ${estimate}`}
          >
            ≈ {estimate}
          </span>
        </>
      )}
    </span>
  );
}

/** 追加料金は赤、割引は緑にし、通貨ごとに符号を表示する。 */
export function PriceChange({ value }: { value: number }) {
  return (
    <span
      className={`${value > 0 ? "text-destructive" : "text-success"} [&_[aria-label]]:text-inherit`}
    >
      <Money value={value} signed />
    </span>
  );
}
