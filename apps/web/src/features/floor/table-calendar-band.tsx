import type { TableState, TimelinePage, TimelineSession } from "@tablecast/api/schema";
import { uiLocale } from "@tablecast/api/localization";
import { Clock3, Users } from "lucide-react";
import { tv } from "tailwind-variants";
import { LanguageLabel } from "../../components/language-label";
import { Button } from "../../components/ui/button";
import { money, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { tableTimeLimit, timeLimitText, visitPosition } from "./floor-model";
import { visitLabel, visitTone } from "./table-calendar-label-model";
import { VisitAttention, VisitPreview } from "./table-calendar-preview";
import { TableTimeLimit } from "./table-time-limit";

const band = tv({
  base: "absolute top-2 flex h-12 min-h-12 min-w-0 items-center justify-start overflow-clip rounded-lg border-0 bg-(image:--surface-sheen) p-0 text-left text-xs shadow-control ring-1 ring-inset focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  variants: {
    tone: {
      info: "bg-info-soft text-foreground ring-info-border hover:bg-info-hover active:bg-info-selected aria-expanded:bg-info-selected dark:hover:bg-info-hover",
      warning:
        "bg-warning-soft text-foreground ring-warning-border hover:bg-warning-hover active:bg-warning-selected aria-expanded:bg-warning-selected dark:hover:bg-warning-hover",
      destructive:
        "bg-destructive-soft text-foreground ring-destructive-border hover:bg-destructive-hover active:bg-destructive-selected aria-expanded:bg-destructive-selected dark:hover:bg-destructive-hover",
      inactive:
        "bg-control text-foreground ring-control-edge hover:bg-control-hover active:bg-control-selected aria-expanded:bg-control-selected dark:hover:bg-control-hover",
    },
  },
});

export function VisitBand({
  session,
  current,
  page,
  now,
  tableName,
  trackWidth,
  onSelect,
}: {
  current?: TableState;
  now: number;
  onSelect: (id: string) => void;
  page: Pick<TimelinePage, "endAt" | "startAt">;
  session: TimelineSession;
  tableName: string;
  trackWidth: number;
}) {
  const { t, locale } = useI18n();
  const position = visitPosition(session, page.startAt, page.endAt, now);
  const width = (position.width * trackWidth) / 100;
  const currentLabel = current
    ? ` · ${t(current.locale === "ja" ? "common_language_native_ja" : "common_language_native_en")} · ${timeLimitText(tableTimeLimit(current.plan, now), locale)}`
    : "";
  if (position.width <= 0) return null;
  return (
    <VisitPreview
      session={session}
      current={current}
      now={now}
      tableName={tableName}
      onSelect={onSelect}
      trigger={
        <Button
          variant="ghost"
          className={band({ tone: visitTone(session, current) })}
          style={{ left: `${position.left}%`, width: `${position.width}%` }}
          aria-label={`${visitLabel(session, tableName, locale, t("admin_guests"), t("admin_open"))}${currentLabel} · ${t("floor_show_summary")}`}
        >
          {width >= 72 && (
            <VisitBandLabel
              session={session}
              current={current}
              now={now}
              width={width}
              position={position}
            />
          )}
        </Button>
      }
    />
  );
}

function VisitBandLabel({
  session,
  current,
  now,
  width,
  position,
}: {
  current?: TableState;
  now: number;
  position: ReturnType<typeof visitPosition>;
  session: TimelineSession;
  width: number;
}) {
  const { t, locale } = useI18n();
  const duration = Math.max(0, Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000));
  return (
    <span className="sticky left-0 w-0 shrink-0">
      <span className="flex w-max flex-col gap-0.5 px-2 py-1">
        <span className="flex items-center gap-2 whitespace-nowrap font-semibold">
          {current && <LanguageLabel locale={current.locale} compact />}
          {current && <TableTimeLimit plan={current.plan} now={now} compact />}
          <span>
            {position.continuesBefore && "← "}
            {t(session.status === "open" ? "admin_open" : "admin_closed")}
            {position.continuesAfter && " →"}
          </span>
          <VisitAttention current={current} />
        </span>
        <span className="flex items-center gap-3 whitespace-nowrap tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            {session.guestCount}
          </span>
          {width >= 128 && (
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden className="size-3" />
              {m.floor_elapsed({ minutes: duration }, { locale: uiLocale(locale) })}
            </span>
          )}
          {width >= 240 && current && (
            <span>{timeLimitText(tableTimeLimit(current.plan, now), locale)}</span>
          )}
          {width >= 400 && current && (
            <span>
              {t("admin_due")} {money(current.bill.due, locale)}
            </span>
          )}
          {width >= 500 && (
            <span className="text-muted-foreground">
              {time(session.openedAt, locale)}
              {session.closedAt !== null && ` → ${time(session.closedAt, locale)}`}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
