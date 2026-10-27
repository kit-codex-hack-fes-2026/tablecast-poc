import { useContext } from "react";
import { CurrencyContext } from "../i18n/currency-context";
import { money } from "../i18n/format";
import { useI18n } from "../i18n/locale";

/** 円は常に主表示。外貨は選択中で取得済みレートがあるときだけ添える。 */
export function Money({
  value,
  signed = false,
  taxIncluded = false,
}: {
  signed?: boolean;
  taxIncluded?: boolean;
  value: number;
}) {
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
      {taxIncluded && <span className="ml-1 text-muted-foreground">{t("price_tax_included")}</span>}
      {estimate && (
        <>
          {" "}
          <span
            className="text-muted-foreground opacity-75"
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
      className={`inline-flex rounded-md px-1.5 py-0.5 ${value > 0 ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success"}`}
    >
      <Money value={value} signed taxIncluded />
    </span>
  );
}
