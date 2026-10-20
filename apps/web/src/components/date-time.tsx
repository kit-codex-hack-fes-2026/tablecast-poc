import { dateTime } from "../i18n/format";
import { useI18n } from "../i18n/locale";

/**
 * 日時をLocaleProviderの言語で表示し、time要素の機械可読な値を付ける。
 * valueは有効なnumber/string/Date、null/undefinedは未取得の横線。
 * 無効な日時文字列を直接渡さない。
 * 業務の日付集計と表示タイムゾーンを混同しない。
 */
export function DateTime({ value }: { value: number | string | Date | null | undefined }) {
  const { locale } = useI18n();
  if (value === null || value === undefined) return <span>—</span>;
  const date = new Date(value);
  return (
    <time className="text-sm tabular-nums" dateTime={date.toISOString()}>
      {dateTime(date, locale)}
    </time>
  );
}
