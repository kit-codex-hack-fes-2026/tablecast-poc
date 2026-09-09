import { dateTime } from "../i18n/format";
import { useI18n } from "../i18n/locale";

export function DateTime({ value }: { value: number | string | Date | null | undefined }) {
  const { locale } = useI18n();
  if (value === null || value === undefined) return <span>—</span>;
  const date = new Date(value);
  return (
    <time
      className="whitespace-nowrap text-sm tabular-nums"
      dateTime={date.toISOString()}
      title={`${date.toISOString()} (UTC)`}
    >
      {dateTime(date, locale)}
    </time>
  );
}
