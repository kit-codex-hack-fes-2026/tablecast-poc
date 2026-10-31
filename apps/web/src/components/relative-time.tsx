import { useHydrated } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { dateTime, relativeTime } from "../i18n/format";
import { useI18n } from "../i18n/locale";

/** 相対時刻を更新し、正確な日時はtime要素とtitleに残す。 */
export function RelativeTime({ value, initialNow }: { initialNow?: number; value: number }) {
  const { locale } = useI18n();
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time dateTime={new Date(value).toISOString()} title={dateTime(value, locale)}>
      {hydrated || initialNow !== undefined
        ? relativeTime(value, now, locale)
        : dateTime(value, locale)}
    </time>
  );
}
