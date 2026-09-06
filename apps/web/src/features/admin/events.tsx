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

export function ActivityLog({ events }: { events: TableEvent[] }) {
  const { locale, t } = useI18n();
  if (!events.length) return <p className="empty-note">{t("common_empty")}</p>;
  return (
    <ol className="activity-log">
      {events.map((event) => (
        <li key={event.cursor}>
          <time>{time(event.createdAt, locale)}</time>
          <span className={`event-dot ${event.kind.split(".")[0]}`} aria-hidden="true" />
          <div>
            <strong>
              <EventLabel event={event} />
            </strong>
            {typeof event.data.text === "string" && (
              <p lang={event.data.locale === "en" ? "en" : "ja"}>
                {event.data.role === "user" ? t("kiosk_guest") : t("kiosk_assistant")}:{" "}
                {event.data.text}
                <small>
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
