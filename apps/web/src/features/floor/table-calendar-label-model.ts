import type { TableState, TimelineSession } from "@tablecast/api/schema";
import { dateTime } from "../../i18n/format";

export function visitLabel(
  session: TimelineSession,
  tableName: string,
  locale: "en" | "ja",
  guests: string,
  open: string,
) {
  return `${tableName} · ${session.guestCount} ${guests} · ${dateTime(session.openedAt, locale)} ${locale === "ja" ? "から" : "to"} ${session.closedAt === null ? open : dateTime(session.closedAt, locale)}`;
}

export function visitTone(session: TimelineSession, current?: TableState) {
  if (current?.staffCalled || (current?.billRequested && current.bill.due > 0)) return "warning";
  if (current?.voiceState === "error") return "destructive";
  return session.status === "open" ? "info" : "inactive";
}
