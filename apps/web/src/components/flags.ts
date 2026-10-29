import type { DisplayCurrencyCode, Locale } from "@tablecast/api/schema";
import au from "flag-icons/flags/4x3/au.svg?url";
import bn from "flag-icons/flags/4x3/bn.svg?url";
import cn from "flag-icons/flags/4x3/cn.svg?url";
import eu from "flag-icons/flags/4x3/eu.svg?url";
import gb from "flag-icons/flags/4x3/gb.svg?url";
import hk from "flag-icons/flags/4x3/hk.svg?url";
import id from "flag-icons/flags/4x3/id.svg?url";
import jp from "flag-icons/flags/4x3/jp.svg?url";
import kh from "flag-icons/flags/4x3/kh.svg?url";
import kp from "flag-icons/flags/4x3/kp.svg?url";
import kr from "flag-icons/flags/4x3/kr.svg?url";
import la from "flag-icons/flags/4x3/la.svg?url";
import mm from "flag-icons/flags/4x3/mm.svg?url";
import mn from "flag-icons/flags/4x3/mn.svg?url";
import mo from "flag-icons/flags/4x3/mo.svg?url";
import my from "flag-icons/flags/4x3/my.svg?url";
import nz from "flag-icons/flags/4x3/nz.svg?url";
import ph from "flag-icons/flags/4x3/ph.svg?url";
import sg from "flag-icons/flags/4x3/sg.svg?url";
import th from "flag-icons/flags/4x3/th.svg?url";
import tw from "flag-icons/flags/4x3/tw.svg?url";
import us from "flag-icons/flags/4x3/us.svg?url";
import vn from "flag-icons/flags/4x3/vn.svg?url";
export { jp };
const languageFlags: Partial<Record<Locale, string>> = {
  ja: jp,
  en: gb,
  "zh-Hans": cn,
  ko: kr,
};
export const currencyFlags: Record<DisplayCurrencyCode, string> = {
  USD: us,
  GBP: gb,
  EUR: eu,
  AUD: au,
  NZD: nz,
  CNY: cn,
  HKD: hk,
  TWD: tw,
  KRW: kr,
  MOP: mo,
  MNT: mn,
  KPW: kp,
  SGD: sg,
  THB: th,
  VND: vn,
  MYR: my,
  IDR: id,
  PHP: ph,
  BND: bn,
  KHR: kh,
  LAK: la,
  MMK: mm,
};

const languageFlagAssets = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

/** 明示された地域か標準の推奨地域を使い、未収録の旗は省略する。 */
export function languageFlag(locale: string): string | undefined {
  const preset = languageFlags[locale];
  if (preset) return preset;
  try {
    const region = new Intl.Locale(locale).maximize().region?.toLowerCase();
    return region
      ? languageFlagAssets[`/node_modules/flag-icons/flags/4x3/${region}.svg`]
      : undefined;
  } catch {
    return undefined;
  }
}
