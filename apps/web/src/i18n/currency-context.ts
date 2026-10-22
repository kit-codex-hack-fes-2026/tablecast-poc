import type {
  DisplayCurrencyCode,
  DisplayCurrencyContext,
  ExchangeRates,
} from "@tablecast/api/schema";
import { createContext } from "react";

export type CurrencyDisplay = {
  currency: DisplayCurrencyCode | null;
  getContext?: () => DisplayCurrencyContext;
  pending?: boolean;
  rates?: ExchangeRates;
  setCurrency?: (currency: DisplayCurrencyCode | null, expectedRevision?: number) => boolean;
};
export const CurrencyContext = createContext<CurrencyDisplay>({ currency: null });
