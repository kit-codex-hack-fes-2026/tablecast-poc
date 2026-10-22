import { displayCurrencyCodes } from "@tablecast/api/schema";
import { useContext } from "react";
import { FlagSelect } from "../../components/flag-select";
import { currencyFlags, jp } from "../../components/flags";
import { CurrencyContext } from "../../i18n/currency-context";
import { currencyName, currencySymbol, yenRate } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

export function CurrencySelector() {
  const { currency, rates, pending, setCurrency } = useContext(CurrencyContext);
  const { locale, t } = useI18n();
  if (!setCurrency) return null;
  return (
    <FlagSelect
      ariaLabel={t("currency_select")}
      value={currency ?? "JPY"}
      onChange={(code) => setCurrency(code === "JPY" ? null : code)}
      options={[
        {
          value: "JPY",
          flag: jp,
          label: "¥ JPY",
          menuLabel: `¥ JPY · ${t("currency_none")}`,
        },
        ...displayCurrencyCodes.map((code) => ({
          value: code,
          flag: currencyFlags[code],
          label: `${currencySymbol(code)} ${code}`,
          menuLabel: `${currencySymbol(code)} ${code} · ${currencyName(code, locale)}`,
          description: rates?.rates[code]
            ? `1 ${code} ≈ ${yenRate.format(1 / rates.rates[code]).replace("JP¥", "¥")}`
            : t(pending ? "currency_loading" : "currency_unavailable"),
        })),
      ]}
      note={t("currency_note")}
      footer={
        rates
          ? `${t("currency_date")}: ${rates.date} · currency-api`
          : t(pending ? "currency_loading" : "currency_unavailable")
      }
    />
  );
}
