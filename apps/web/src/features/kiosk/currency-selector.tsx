import type { DisplayCurrencyCode } from "@tablecast/api/schema";
import {
  currencyFlags,
  currencyName,
  currencySymbol,
  displayCurrencyCodes,
} from "@tablecast/api/currency-display";
import { useContext } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../components/ui/select";
import { CurrencyContext } from "../../i18n/currency-context";
import { useI18n } from "../../i18n/locale";
import { useCurrencyControls } from "./currency-provider";

const yenRate = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 4,
});

function Flag({ currency }: { currency: DisplayCurrencyCode | null }) {
  return (
    <img
      src={`/flags/${currency ? currencyFlags[currency] : "jp"}.svg`}
      alt=""
      aria-hidden="true"
      width={18}
      height={14}
      className="h-3.5 w-4.5 shrink-0 rounded-xs object-contain"
    />
  );
}
export function CurrencySelector() {
  const controls = useCurrencyControls();
  const { currency } = useContext(CurrencyContext);
  const { locale, t } = useI18n();
  if (!controls) return null;
  return (
    <Select
      value={currency ?? "JPY"}
      onValueChange={(value) => {
        const code = displayCurrencyCodes.find((item) => item === value);
        controls.choose(code ?? null);
      }}
    >
      <SelectTrigger
        aria-label={t("currency_select")}
        className="min-h-14 w-auto shrink-0 gap-2 rounded-lg text-sm"
      >
        <Flag currency={currency} />
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
            <Flag currency={null} />¥ JPY · {t("currency_none")}
          </span>
        </SelectItem>
        {displayCurrencyCodes.map((code) => {
          const rate = controls.snapshot?.rates[code];
          return (
            <SelectItem key={code} value={code} className="min-h-14">
              <span className="flex items-start gap-2">
                <span className="pt-1">
                  <Flag currency={code} />
                </span>
                <span className="flex flex-col text-sm">
                  <span className="font-medium">
                    {currencySymbol(code)} {code} · {currencyName(code, locale)}
                  </span>
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    {rate
                      ? `1 ${code} ≈ ${yenRate.format(1 / rate).replace("JP¥", "¥")}`
                      : t(controls.pending ? "currency_loading" : "currency_unavailable")}
                  </span>
                </span>
              </span>
            </SelectItem>
          );
        })}
        <p role="note" className="px-3 py-2 text-xs text-muted-foreground">
          {controls.snapshot
            ? `${t("currency_date")}: ${controls.snapshot.date} · currency-api`
            : t(controls.pending ? "currency_loading" : "currency_unavailable")}
        </p>
      </SelectContent>
    </Select>
  );
}
