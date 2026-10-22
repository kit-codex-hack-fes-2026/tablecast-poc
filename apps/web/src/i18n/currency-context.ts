import type { DisplayCurrencyCode, ExchangeRates } from "@tablecast/api/schema";
import { createContext } from "react";

/** 共通表示部品へ渡す読取専用の参考表示。取得と選択操作は客向けfeatureが所有する。 */
export const CurrencyContext = createContext<{
  currency: DisplayCurrencyCode | null;
  rates?: ExchangeRates;
}>({ currency: null });
