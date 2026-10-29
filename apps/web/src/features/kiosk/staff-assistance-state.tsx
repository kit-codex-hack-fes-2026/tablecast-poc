import type {
  Catalog,
  CoreState,
  Product,
  StaffCallInput,
  TableEvent,
} from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { VoiceConnection } from "./voice-connection";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";
import { guidanceOptions, staffCallsKey, staffCallsOptions } from "./assistance-query";
import {
  assistanceHandoff,
  assistanceNotification,
  assistanceOrderStarted,
  type AssistanceState,
} from "./staff-assistance-model";
import { latestTable } from "./table-cache";
import { tableQueryKey } from "./table-query";
import { useVoiceView } from "./voice-subscription";

export type AssistanceProps = {
  catalog?: Catalog;
  data: CoreState;
  endpoint: TableEndpoint;
  events: TableEvent[];
  onChoose: (product: Product) => void;
  voice: VoiceConnection;
};
export function useStaffAssistance({
  data,
  endpoint,
  catalog,
  events,
  voice,
  onChoose,
}: AssistanceProps) {
  const { locale } = useI18n();
  const client = useQueryClient();
  const view = useVoiceView(voice);
  const [state, setState] = useState<AssistanceState>(() => ({
    open: false,
    tab: "advice",
    selection: {},
    voiceProductIds: [],
    openedAt: Date.now(),
    mountedCursor: data.cursor,
    dismissedAt: 0,
    shownCursor: 0,
  }));
  const ownedVoice = useRef<null | number>(null);
  const requestKey = useRef("");
  const guidance = useInfiniteQuery({
    ...guidanceOptions(endpoint, data, state.selection),
    enabled:
      state.open &&
      state.tab === "advice" &&
      Boolean(state.selection.query || state.selection.guideId),
  });
  const history = useInfiniteQuery({
    ...staffCallsOptions(endpoint, data.id),
    enabled: state.open,
  });
  const guides = [
    ...new Map(
      (guidance.data?.pages.flatMap((page) => page.guides) ?? []).map((guide) => [guide.id, guide]),
    ).values(),
  ];
  const shownIds = new Set(state.voiceProductIds);
  const products = [
    ...new Map(
      [
        ...(guidance.data?.pages.flatMap((page) => page.products) ?? []),
        ...(catalog?.configuration.products
          .filter((product) => shownIds.has(product.id))
          .map((product) => ({
            id: product.id,
            text: resolveText(product.text, locale),
            price: product.price,
            available: product.available,
          })) ?? []),
      ].map((product) => [product.id, product]),
    ).values(),
  ];
  const recordedCalls = [
    ...new Map(
      (history.data?.pages.flatMap((page) => page.calls) ?? []).map((call) => [call.id, call]),
    ).values(),
  ];
  const calls = data.staffCall
    ? [data.staffCall, ...recordedCalls.filter((entry) => entry.id !== data.staffCall?.id)]
    : recordedCalls;
  const call = useMutation({
    mutationFn: (input: StaffCallInput) =>
      parseResponse(endpoint.client.call.$post({ query: { view: "core" }, json: input })),
    onSuccess: (updated) => {
      client.setQueryData<CoreState>(tableQueryKey(endpoint), (current) =>
        latestTable(current, updated),
      );
      void client.invalidateQueries({ queryKey: staffCallsKey(endpoint, data.id) });
      requestKey.current = crypto.randomUUID();
      setState((current) => ({
        ...current,
        tab: updated.staffCall ? "call" : "history",
        selectedCallId: updated.staffCall?.id,
      }));
    },
  });
  useEffect(
    () => () => {
      if (ownedVoice.current !== null) void voice.stop();
    },
    [voice],
  );
  useEffect(() => {
    if (ownedVoice.current !== null && assistanceOrderStarted(events, ownedVoice.current))
      ownedVoice.current = null;
  }, [events]);
  const notification = assistanceNotification(
    state,
    events,
    data.voiceSessionId,
    data.configVersion,
    view,
  );
  if (notification) setState(notification);
  function begin() {
    setState((current) => ({
      ...current,
      open: true,
      tab: "advice",
      openedAt: Date.now(),
      dismissedAt: 0,
    }));
    requestKey.current = crypto.randomUUID();
    if (["idle", "paused", "error"].includes(view.status)) {
      ownedVoice.current = data.cursor;
      void voice.start(locale, data.speechSpeed, "assistance");
    } else voice.requestAssistance();
  }
  function close() {
    setState((current) => ({ ...current, open: false, dismissedAt: Date.now() }));
    if (ownedVoice.current !== null) {
      if (!assistanceOrderStarted(events, ownedVoice.current)) void voice.stop();
      ownedVoice.current = null;
    }
  }
  function open() {
    if (state.tab === "call" || state.tab === "history" || data.staffCall)
      setState((current) => ({ ...current, open: true, tab: "history" }));
    else begin();
  }
  function selectTopic(query: string) {
    setState((current) => ({
      ...current,
      tab: "advice",
      voiceProductIds: [],
      selection: { query },
    }));
    voice.requestAssistance(query);
  }
  function directCall() {
    requestKey.current ||= crypto.randomUUID();
    call.mutate({
      ...assistanceHandoff(catalog, state.selection, view, state.openedAt, locale),
      idempotencyKey: requestKey.current,
    });
  }
  function choose(productId: string) {
    const product = catalog?.configuration.products.find((item) => item.id === productId);
    if (!product) return;
    ownedVoice.current = null;
    setState((current) => ({ ...current, open: false, dismissedAt: Date.now() }));
    onChoose(product);
  }
  const showHistory = () => setState((current) => ({ ...current, tab: "history" }));
  const showAdvice = () => setState((current) => ({ ...current, tab: "advice" }));
  const showTopics = () => setState((current) => ({ ...current, tab: "topics" }));
  const showCall = (id: string) =>
    setState((current) => ({ ...current, tab: "call", selectedCallId: id }));
  return {
    state,
    view,
    guidance,
    history,
    guides,
    products,
    calls,
    call,
    begin,
    close,
    open,
    selectTopic,
    directCall,
    choose,
    showHistory,
    showAdvice,
    showTopics,
    showCall,
  };
}
