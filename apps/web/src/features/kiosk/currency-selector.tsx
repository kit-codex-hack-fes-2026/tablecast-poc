import { displayCurrencyCodes } from "@tablecast/api/schema";
import { useContext } from "react";
import { Flag } from "../../components/flag";
import { currencyFlags, jp } from "../../components/flags";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../components/ui/select";
import { CurrencyContext } from "../../i18n/currency-context";
import { currencyName, currencySymbol, yenRate } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

export function CurrencySelector() {
  const { currency, rates, pending, setCurrency } = useContext(CurrencyContext);
  const { locale, t } = useI18n();
  if (!setCurrency) return null;
  return (
    <Select
      value={currency ?? "JPY"}
      onValueChange={(value) => {
        const code = displayCurrencyCodes.find((item) => item === value);
        setCurrency(code ?? null);
      }}
    >
      <SelectTrigger
        aria-label={t("currency_select")}
        className="min-h-14 w-auto shrink-0 gap-2 rounded-lg text-sm"
      >
        <Flag src={currency ? currencyFlags[currency] : jp} />
        <span>
          {currencySymbol(currency ?? "JPY")} {currency ?? "JPY"}
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-[min(32rem,75dvh)] w-80 max-w-[calc(100vw-2rem)]">
        <p role="note" className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t("currency_note")}
        </p>
        <SelectItem value="JPY" className="min-h-14">
          <span className="flex items-center gap-2">
            <Flag src={jp} />¥ JPY · {t("currency_none")}
          </span>
        </SelectItem>
        {displayCurrencyCodes.map((code) => {
          const rate = rates?.rates[code];
          return (
            <SelectItem key={code} value={code} className="min-h-14">
              <span className="flex items-start gap-2">
                <span className="pt-1">
                  <Flag src={currencyFlags[code]} />
                </span>
                <span className="flex flex-col text-sm">
                  <span className="font-medium">
                    {currencySymbol(code)} {code} · {currencyName(code, locale)}
                  </span>
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    {rate
                      ? `1 ${code} ≈ ${yenRate.format(1 / rate).replace("JP¥", "¥")}`
                      : t(pending ? "currency_loading" : "currency_unavailable")}
                  </span>
                </span>
              </span>
            </SelectItem>
          );
        })}
        <p role="note" className="px-3 py-2 text-xs text-muted-foreground">
          {rates
            ? `${t("currency_date")}: ${rates.date} · currency-api`
            : t(pending ? "currency_loading" : "currency_unavailable")}
        </p>
      </SelectContent>
    </Select>
  );
}
