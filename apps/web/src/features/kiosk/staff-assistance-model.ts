import type { Catalog, Locale, StaffCallInput, TableEvent } from "@tablecast/api/schema";
import type { VoiceView } from "./voice-model";
import { guideTemplates } from "../configuration/guide-model";

export function assistanceHandoff(
  catalog: Catalog | undefined,
  selection: { guideId?: string; query?: string },
  view: VoiceView,
  openedAt: number,
  locale: Locale,
): StaffCallInput {
  const selected = catalog?.configuration.guides?.find(
    (guide) => guide.id === selection.guideId || guide.text[locale].displayName === selection.query,
  );
  const topic = guideTemplates.find(
    (item) => item.ja === selection.query || item.en === selection.query,
  );
  const original = view.messages?.findLast(
    (message) => message.role === "user" && message.final && message.createdAt >= openedAt,
  );
  const name = selected?.text.ja.displayName ?? topic?.ja;
  return {
    locale: original?.locale ?? locale,
    summaryJa: name ? `${name}について店員の対応を希望しています。` : undefined,
    originalText: original?.text ?? selection.query ?? "",
    attempted: selected ? [selected.text.ja.displayName] : [],
  };
}

export type AssistanceState = {
  dismissedAt: number;
  mountedCursor: number;
  open: boolean;
  openedAt: number;
  selection: { guideId?: string; query?: string };
  shownCursor: number;
  tab: "advice" | "history";
  voiceProductIds: string[];
};

export function assistanceNotification(
  state: AssistanceState,
  events: TableEvent[],
  voiceSessionId: null | string,
  configVersion: number,
  view: VoiceView,
): AssistanceState | null {
  const event = events.findLast(
    (item) =>
      item.kind === "assistance.shown" &&
      item.cursor > state.mountedCursor &&
      item.data.voiceSessionId === voiceSessionId &&
      item.data.configVersion === configVersion,
  );
  if (!event || event.cursor <= state.shownCursor) return null;
  const hasNewRequest = view.messages?.some(
    (message) => message.role === "user" && message.final && message.createdAt > state.dismissedAt,
  );
  if (state.dismissedAt && !state.open && !hasNewRequest)
    return { ...state, shownCursor: event.cursor };
  const ids = event.data.guideIds;
  const guideId = Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : undefined;
  return {
    ...state,
    shownCursor: event.cursor,
    voiceProductIds: Array.isArray(event.data.productIds)
      ? event.data.productIds.filter((id): id is string => typeof id === "string")
      : [],
    selection: guideId ? { guideId } : {},
    tab: "advice",
    open: true,
  };
}
