import { storeDateSchema, storeTimeZone, type TimelineSession } from "@tablecast/api/schema";
import { z } from "zod";

export const floorSearchSchema = z.object({
  view: z.enum(["list", "timeline"]).optional().catch(undefined),
  date: storeDateSchema.optional().catch(undefined),
});
export type FloorSearch = z.infer<typeof floorSearchSchema>;
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
    continuesAfter: (session.closedAt ?? now) >= endAt,
  };
}
