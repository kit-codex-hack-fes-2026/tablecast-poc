import type { TableEvent } from "@tablecast/api/schema";
import { time, useI18n } from "../../i18n/locale";
import type { m } from "../../paraglide/messages.js";

const eventKeys: Record<string, keyof typeof m> = {
  "cart.updated": "event_cart_updated",
  "order.submitted": "event_order_submitted",
  "staff.called": "event_staff_called",
  "staff.resolved": "event_staff_resolved",
  "voice.started": "event_voice_started",
  "voice.stopped": "event_voice_stopped",
  "voice.error": "event_voice_error",
  "locale.changed": "event_locale_changed",
  "billing.payment": "event_payment_recorded",
  "billing.adjustment": "event_bill_adjusted",
  "bill.requested": "admin_billing",
  "configuration.published": "event_config_published",
  "table.closed": "event_session_closed",
  "table.opened": "event_session_opened",
  "voice.user": "event_conversation",
  "voice.assistant": "event_conversation",
  "voice.proactive": "event_voice_proactive",
  "confirmation.prepared": "event_confirmation_created",
};
const orderStatusKeys: Record<string, keyof typeof m> = {
  accepted: "event_order_accepted",
  served: "event_order_served",
  cancelled: "event_order_cancelled",
  rejected: "event_order_rejected",
};

export function EventLabel({ event }: { event: TableEvent }) {
  const { t } = useI18n();
  const key =
    event.kind === "order.status" && typeof event.data.status === "string"
      ? orderStatusKeys[event.data.status]
      : eventKeys[event.kind];
  return <>{t(key ?? "event_activity")}</>;
}

export function ActivityLog({
  events,
  includeDate = false,
}: {
  events: TableEvent[];
  includeDate?: boolean;
}) {
  const { locale, t } = useI18n();
  if (!events.length)
    return <p className="py-12 px-6 text-muted-foreground text-center">{t("common_empty")}</p>;
  const dateTime = includeDate
    ? new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tokyo",
      })
    : null;
  return (
    <ol
      className="activity-log list-none py-1 px-0 [&_>_li::before]:content-[''] [&_>_li::before]:absolute [&_>_li::before]:left-14 [&_>_li::before]:top-8 [&_>_li::before]:-bottom-2.5 [&_>_li::before]:w-px [&_>_li::before]:bg-border [&_>_li:last-child::before]:hidden [&[data-with-date]_time]:w-24 [&[data-with-date]_>_li::before]:left-28"
      data-with-date={includeDate || undefined}
    >
      {events.map((event) => (
        <li
          className="flex items-start gap-3.5 py-3.5 px-0 relative"
          key={event.cursor}
          data-event-cursor={event.cursor}
        >
          <time
            className="text-xs w-9 shrink-0 text-muted-foreground mt-0.5"
            dateTime={new Date(event.createdAt).toISOString()}
          >
            {dateTime?.format(event.createdAt) ?? time(event.createdAt, locale)}
          </time>
          <span
            data-state={event.kind.split(".")[0]}
            className="w-2 h-2 rounded-full bg-muted shrink-0 mt-1 [&[data-state=order]]:bg-success [&[data-state=staff]]:bg-accent"
            aria-hidden="true"
          />
          <div>
            <strong className="text-xs font-medium">
              <EventLabel event={event} />
            </strong>
            {typeof event.data.text === "string" && (
              <p
                className="text-xs mt-1 text-muted-foreground leading-loose whitespace-pre-wrap"
                lang={event.data.locale === "en" ? "en" : "ja"}
              >
                {event.data.role === "user" ? t("kiosk_guest") : t("kiosk_assistant")}:{" "}
                {event.data.text}
                <small className="block text-xs text-muted-foreground mt-0.5">
                  {event.data.locale === "en" ? "English" : "日本語"}
                  {typeof event.data.source === "string" &&
                    event.data.source.startsWith("synthetic-") &&
                    ` · ${t("common_synthetic")}`}
                </small>
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
