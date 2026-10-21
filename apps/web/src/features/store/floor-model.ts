import {
  storeDateSchema,
  storeTimeZone,
  type TimelineSession,
  type TableState,
} from "@tablecast/api/schema";
import { z } from "zod";

export const floorSortValues = [
  "table:asc",
  "table:desc",
  "status:asc",
  "status:desc",
  "duration:asc",
  "duration:desc",
  "guests:asc",
  "guests:desc",
  "due:asc",
  "due:desc",
] as const;

export const floorSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
  sort: z.enum(floorSortValues).optional().catch(undefined),
  zoom: z.enum(["compact", "normal", "detailed"]).optional().catch(undefined),
  view: z.enum(["list", "timeline"]).optional().catch(undefined),
  date: storeDateSchema.optional().catch(undefined),
  filter: z
    .enum(["all", "attention", "active", "called", "billing", "voice", "vacant"])
    .optional()
    .catch(undefined),
});
export type FloorSearch = z.infer<typeof floorSearchSchema>;
export type FloorFilter = NonNullable<FloorSearch["filter"]>;
export type FloorSort = NonNullable<FloorSearch["sort"]>;
export type FloorZoom = NonNullable<FloorSearch["zoom"]>;
export const floorTrackWidths: Record<FloorZoom, number> = {
  compact: 1152,
  normal: 2304,
  detailed: 4608,
};

export function floorPriority(visit?: TableState | null) {
  if (!visit) return 4;
  if (visit.staffCalled) return 0;
  if (visit.billRequested && visit.bill.due > 0) return 1;
  if (visit.voiceState === "error") return 2;
  return 3;
}

/** 同じ表示名では卓IDを使って順序を安定させる。ID自体は表示・選択候補に使わない。 */
export function compareFloorRows(
  a: { id: string; name: string; status: number; duration: number; guests: number; due: number },
  b: { id: string; name: string; status: number; duration: number; guests: number; due: number },
  sort: FloorSort,
  locale: string,
) {
  const direction = sort.endsWith(":desc") ? -1 : 1;
  const name = a.name.localeCompare(b.name, locale, { numeric: true });
  const field = sort.split(":")[0];
  const result =
    field === "table"
      ? name
      : field === "status"
        ? a.status - b.status
        : field === "duration"
          ? a.duration - b.duration
          : field === "guests"
            ? a.guests - b.guests
            : a.due - b.due;
  return result * direction || name || a.id.localeCompare(b.id);
}
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: storeTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const storeDate = (value: number) => dateFormat.format(value);
export function moveDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function visitPosition(
  session: TimelineSession,
  startAt: number,
  endAt: number,
  now: number,
) {
  const start = Math.max(session.openedAt, startAt);
  const end = Math.min(session.closedAt ?? now, endAt);
  return {
    left: Math.max(0, ((start - startAt) / (endAt - startAt)) * 100),
    width: Math.max(0, ((end - start) / (endAt - startAt)) * 100),
    continuesBefore: session.openedAt < startAt,
    continuesAfter: session.closedAt === null ? now >= endAt : session.closedAt > endAt,
  };
}
