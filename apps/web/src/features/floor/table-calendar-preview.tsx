import type { TableState, TimelineSession } from "@tablecast/api/schema";
import { Popover } from "@base-ui/react/popover";
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  History,
  ReceiptText,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { cn } from "tailwind-variants";
import { LanguageLabel } from "../../components/language-label";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { surfaceMotion } from "../../components/ui/motion-variants";
import { dateTime, money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { visitLabel, visitTone } from "./table-calendar-label-model";
import { TableTimeLimit } from "./table-time-limit";

const popupClass = cn(
  "w-80 max-w-[var(--available-width)] rounded-xl border border-border bg-card p-4 text-foreground shadow-lg",
  surfaceMotion(),
);

export function VisitPreview({
  session,
  current,
  now,
  tableName,
  onSelect,
  trigger,
}: {
  current?: TableState;
  now: number;
  onSelect: (id: string) => void;
  session: TimelineSession;
  tableName: string;
  trigger: ReactElement;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerElement = useRef<HTMLButtonElement>(null);
  const restoringFocus = useRef(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={triggerElement}
        openOnHover
        delay={200}
        closeDelay={150}
        render={trigger}
        onFocus={(event) => {
          if (!restoringFocus.current && event.currentTarget.matches(":focus-visible"))
            setOpen(true);
        }}
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="z-50">
          <Popover.Popup
            render={(props, state) => (
              <div {...props} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            initialFocus={false}
            finalFocus={() => {
              // 閉じた後のfocus復帰を新たな閲覧操作として扱わず、横位置も保つ。
              restoringFocus.current = true;
              triggerElement.current?.focus({ preventScroll: true });
              restoringFocus.current = false;
              return false;
            }}
            className={popupClass}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <Popover.Title className="font-semibold">
                {tableName} · {t("floor_summary")}
              </Popover.Title>
              <Popover.Close
                render={<Button variant="ghost" size="icon-sm" />}
                aria-label={t("common_close")}
              >
                <X aria-hidden />
              </Popover.Close>
            </div>
            <VisitSummary session={session} current={current} now={now} />
            <Button
              variant="outline"
              className="mt-4 w-full justify-between"
              onClick={() => onSelect(session.id)}
            >
              {t("floor_open_details")}
              <ChevronRight aria-hidden />
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function VisitSummary({
  session,
  current,
  now,
}: {
  current?: TableState;
  now: number;
  session: TimelineSession;
}) {
  const { t, locale } = useI18n();
  const duration = Math.max(0, Math.floor(((session.closedAt ?? now) - session.openedAt) / 60_000));
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={visitTone(session, current)}>
          {t(session.status === "open" ? "admin_open" : "admin_closed")}
        </Badge>
        <VisitAttention current={current} verbose />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <Users aria-hidden className="size-4 text-muted-foreground" />
          {session.guestCount} {t("admin_guests")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 aria-hidden className="size-4 text-muted-foreground" />
          {m.floor_elapsed({ minutes: duration }, { locale })}
        </span>
        {current && <LanguageLabel locale={current.locale} />}
      </div>
      <p className="text-xs text-muted-foreground">
        {dateTime(session.openedAt, locale)}
        {session.closedAt !== null && <> → {dateTime(session.closedAt, locale)}</>}
      </p>
      <TableTimeLimit plan={current?.plan} now={now} detail />
      {current && (
        <dl className="space-y-2 border-t border-border pt-3 tabular-nums">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
              <ReceiptText aria-hidden className="size-4" />
              {t("admin_ordered")}
            </dt>
            <dd>{money(current.bill.orderedTotal, locale)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 font-semibold">
            <dt>{t("admin_due")}</dt>
            <dd>{money(current.bill.due, locale)}</dd>
          </div>
          {current.cart.total > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
              <dt>{t("admin_cart")}</dt>
              <dd>{money(current.cart.total, locale)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export function VisitAttention({
  current,
  verbose = false,
}: {
  current?: TableState;
  verbose?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {current?.staffCall && (
        <p lang="ja" className="text-sm wrap-anywhere">
          {current.staffCall.handoff.summaryJa}
        </p>
      )}
      {current?.staffCalled && (
        <span className="inline-flex items-center gap-1 text-warning">
          <Bell aria-label={t("admin_attention")} className="size-3.5 shrink-0" />
          {verbose && t("admin_attention")}
        </span>
      )}
      {current?.billRequested && current.bill.due > 0 && (
        <span className="inline-flex items-center gap-1 text-warning">
          <CircleDollarSign aria-label={t("admin_billing")} className="size-3.5 shrink-0" />
          {verbose && t("admin_billing")}
        </span>
      )}
      {current?.voiceState === "error" && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <TriangleAlert aria-label={t("admin_voice_errors")} className="size-3.5 shrink-0" />
          {verbose && t("admin_voice_errors")}
        </span>
      )}
    </>
  );
}

export /** 短時間・0分・重なる来店にも、正確な時間幅を広げず44px以上の操作を用意する。 */
function VisitList({
  visits,
  tableName,
  currentForSession,
  now,
  onSelect,
  partial,
}: {
  currentForSession: (session: TimelineSession) => TableState | undefined;
  now: number;
  onSelect: (id: string) => void;
  partial: boolean;
  tableName: string;
  visits: TimelineSession[];
}) {
  const { t, locale } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="ghost" size="icon-sm" className="flex-col gap-0.5 text-xs" />}
        aria-label={
          partial
            ? m.floor_visits_partial({ table: tableName, count: visits.length }, { locale })
            : m.floor_visits({ table: tableName, count: visits.length }, { locale })
        }
      >
        <History aria-hidden className="size-4" />
        <span className="tabular-nums">
          {visits.length}
          {partial && "+"}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup
            render={(props, state) => (
              <div {...props} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            className={cn(popupClass, "max-h-[min(32rem,var(--available-height))] overflow-y-auto")}
          >
            <Popover.Title className="mb-3 font-semibold">
              {tableName} · {t("floor_history")}
            </Popover.Title>
            {partial && (
              <p className="mb-3 text-xs text-muted-foreground">{t("floor_history_loaded")}</p>
            )}
            <div className="space-y-3">
              {visits.map((session) => (
                <div key={session.id} className="rounded-lg bg-surface-subtle p-3">
                  <VisitSummary session={session} current={currentForSession(session)} now={now} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full justify-between"
                    aria-label={`${visitLabel(session, tableName, locale, t("admin_guests"), t("admin_open"))} · ${t("floor_open_details")}`}
                    onClick={() => onSelect(session.id)}
                  >
                    {t("floor_open_details")}
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
