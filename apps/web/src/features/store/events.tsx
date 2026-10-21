import type { TableEvent } from "@tablecast/api/schema";
import {
  Bell,
  CircleCheck,
  CircleDollarSign,
  MessageCircle,
  Radio,
  ReceiptText,
  Table2,
} from "lucide-react";
import { LanguageLabel } from "../../components/language-label";
import { dateTime, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

const eventKeys: Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
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
const orderStatusKeys: Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
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
  return (
    <ol
      data-ui="activity-log"
      className="list-none py-1 [&_>_li::before]:absolute [&_>_li::before]:left-4 [&_>_li::before]:top-12 [&_>_li::before]:bottom-0 [&_>_li::before]:w-px [&_>_li::before]:bg-border [&_>_li:last-child::before]:hidden"
      data-with-date={includeDate || undefined}
    >
      {events.map((event) => {
        const group = event.kind.split(".")[0];
        const Icon =
          group === "order" || group === "cart"
            ? ReceiptText
            : group === "staff"
              ? Bell
              : group === "billing" || group === "bill"
                ? CircleDollarSign
                : group === "table"
                  ? Table2
                  : group === "voice"
                    ? Radio
                    : group === "configuration"
                      ? CircleCheck
                      : MessageCircle;
        const tone =
          event.kind === "voice.error"
            ? "bg-destructive/10 text-destructive"
            : event.kind === "staff.called" || event.kind === "bill.requested"
              ? "bg-warning-soft text-warning"
              : event.kind === "staff.resolved" || event.kind === "billing.payment"
                ? "bg-success-soft text-success"
                : "bg-info-soft text-info";
        return (
          <li
            className="relative grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 py-3"
            key={event.cursor}
            data-event-cursor={event.cursor}
          >
            <span
              aria-hidden="true"
              className={`relative flex size-8 items-center justify-center rounded-lg ${tone}`}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <strong className="text-sm font-medium">
                  <EventLabel event={event} />
                </strong>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(event.createdAt).toISOString()}
                >
                  {includeDate ? dateTime(event.createdAt, locale) : time(event.createdAt, locale)}
                </time>
              </div>
              {typeof event.data.text === "string" && (
                <p
                  className="text-sm mt-2 text-muted-foreground leading-relaxed whitespace-pre-wrap"
                  lang={event.data.locale === "en" ? "en" : "ja"}
                >
                  {event.data.role === "user" ? t("kiosk_guest") : t("kiosk_assistant")}:{" "}
                  {event.data.text}
                  <small className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <LanguageLabel locale={event.data.locale === "en" ? "en" : "ja"} />
                    {typeof event.data.source === "string" &&
                      event.data.source.startsWith("synthetic-") &&
                      ` · ${t("common_synthetic")}`}
                  </small>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
