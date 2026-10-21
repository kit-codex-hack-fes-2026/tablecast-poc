import type {
  CartLine,
  Locale,
  PricedLine,
  Product,
  Snapshot,
  TableState,
  UiSection,
  UiSectionInput,
} from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { latestTable } from "./table-cache";
import { tableCatalogOptions, tableQueryKey } from "./table-query";
import { VoiceConnection } from "./voice-connection";
import { useVoiceControls } from "./voice-subscription";

export function useTableSession({
  data,
  refresh,
  endpoint,
}: {
  data: TableState;
  endpoint: TableEndpoint;
  refresh: () => void;
}) {
  const tableKey = useMemo(() => tableQueryKey(endpoint), [endpoint]);
  const { locale, setLocale, t } = useI18n();
  const client = useQueryClient();
  const catalog = useQuery(tableCatalogOptions(data.storeId, data.configVersion, endpoint));
  const [voice] = useState(() => new VoiceConnection(() => {}, refresh, endpoint.client));
  const view = useVoiceControls(voice);
  useEffect(() => voice.observeMicrophones(), [voice]);
  const [chosen, setChosen] = useState<{
    cartVersion: number;
    configVersion: number;
    line?: CartLine;
    product: Product;
  }>();
  const [prepared, setSnapshot] = useState<Snapshot>();
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const [ordered, setOrdered] = useState(false);
  const receive = (updated: TableState) =>
    client.setQueryData<TableState>(tableKey, (current) => latestTable(current, updated));
  const screen = useMutation({
    scope: { id: `tablecast-ui-${data.id}` },
    mutationFn: (input: UiSectionInput) =>
      parseResponse(endpoint.client.ui.$patch({ json: input })),
    onSuccess: receive,
    onError: refresh,
  });
  const { mutate: changeScreen } = screen;
  const previousConfigVersion = useRef(data.configVersion);
  useEffect(() => {
    if (previousConfigVersion.current !== data.configVersion) {
      previousConfigVersion.current = data.configVersion;
      changeScreen({ section: "menu", productId: null });
    }
  }, [data.configVersion, changeScreen]);
  const section = screen.isPending ? screen.variables.section : data.uiSection;
  const selectedProductId = screen.isPending ? screen.variables.productId : data.selectedProductId;
  const setSection = (next: UiSection) => {
    setChosen(undefined);
    screen.mutate({ section: next, productId: null });
  };

  const selectedProduct = catalog.data?.configuration.products.find(
    (item) => item.id === selectedProductId,
  );
  const selection = selectedProduct
    ? chosen?.product.id === selectedProduct.id && chosen.configVersion === data.configVersion
      ? chosen
      : {
          product: selectedProduct,
          line: data.cart.lines.find(
            (line) =>
              line.productId === selectedProduct.id &&
              (line.missing.length > 0 || !!line.conditionIssues?.length),
          ),
          configVersion: data.configVersion,
          cartVersion: data.cart.version,
        }
    : undefined;
  const speed = useMutation({
    scope: { id: `tablecast-speed-${data.id}` },
    mutationFn: (value: number) =>
      parseResponse(endpoint.client.voice.speed.$patch({ json: { speed: value } })),
    onSuccess: receive,
    onError: refresh,
  });
  const [submitKey, setSubmitKey] = useState("");
  useRealtime("table", data.cursor, refresh, endpoint.client);
  const snapshot =
    prepared &&
    prepared.cartVersion === data.cart.version &&
    prepared.locale === data.locale &&
    data.snapshot?.id === prepared.id &&
    ["pending", "read"].includes(data.snapshot.status)
      ? prepared
      : undefined;
  const snapshotId = snapshot?.id;
  useEffect(() => {
    if (snapshotId) confirmationHeading.current?.focus();
  }, [snapshotId]);
  useEffect(() => {
    setLocale(data.locale);
  }, [data.locale, setLocale]);
  useEffect(
    () => () => {
      void voice.stop();
    },
    [voice],
  );
  useEffect(() => {
    if (!prepared) return undefined;
    const timer = setTimeout(
      () => setSnapshot(undefined),
      Math.max(0, prepared.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [prepared]);
  useEffect(() => {
    voice.synchronise(data.voiceSessionId, data.voiceState === "active", data.speechSpeed);
  }, [data.voiceSessionId, data.voiceState, data.speechSpeed, voice]);
  const customerContextCursor =
    data.events.findLast((event) => event.kind === "customer.context-reset")?.cursor ?? 0;
  const previousCustomerContext = useRef(0);
  useEffect(() => {
    if (customerContextCursor > previousCustomerContext.current) {
      previousCustomerContext.current = customerContextCursor;
      voice.clearCustomerContext();
    }
  }, [customerContextCursor, voice]);
  const updateCart = useMutation({
    mutationFn: ({ lines, expectedVersion }: { expectedVersion: number; lines: CartLine[] }) =>
      parseResponse(endpoint.client.cart.$put({ json: { expectedVersion, lines } })),
    onSuccess: (updated) => {
      receive(updated);
      setChosen(undefined);
      screen.mutate({ section: "cart", productId: null });
      setSnapshot(undefined);
    },
    onError: refresh,
  });
  const resetCart = updateCart.reset;
  const choose = useCallback(
    (product: Product) => {
      resetCart();
      setChosen({ product, configVersion: data.configVersion, cartVersion: data.cart.version });
      changeScreen({ section: "menu", productId: product.id });
    },
    [resetCart, changeScreen, data.configVersion, data.cart.version],
  );
  const prepare = useMutation({
    mutationFn: () =>
      parseResponse(
        endpoint.client.confirm.$post({
          json: { expectedVersion: data.cart.version, channel: "gui" },
        }),
      ),
    onSuccess: (confirmation) => {
      client.setQueryData<TableState>(tableKey, (current) =>
        current ? { ...current, snapshot: confirmation } : current,
      );
      setSection("cart");
      setSnapshot(confirmation);
      setSubmitKey(crypto.randomUUID());
    },
    onError: refresh,
  });
  const submit = useMutation({
    mutationFn: (confirmation: Snapshot) => {
      return parseResponse(
        endpoint.client.orders.$post({
          json: { snapshotId: confirmation.id, idempotencyKey: submitKey, approved: true },
        }),
      );
    },
    onSuccess: () => {
      setSnapshot(undefined);
      setOrdered(true);
      void client.invalidateQueries({ queryKey: tableKey });
      refresh();
    },
    onError: refresh,
  });
  const call = useMutation({
    mutationFn: (bill: boolean) =>
      parseResponse(bill ? endpoint.client.bill.request.$post() : endpoint.client.call.$post()),
    onSuccess: receive,
  });
  const language = useMutation({
    mutationFn: async (next: Locale) => {
      await voice.stop({ existingSession: view.error === "active" });
      return parseResponse(endpoint.client.locale.$patch({ json: { locale: next } }));
    },
    onSuccess: (updated) => {
      receive(updated);
      setLocale(updated.locale);
    },
    onError: refresh,
  });
  function currentLines(): CartLine[] {
    return (
      data.cart.lines.map(({ id, productId, quantity, selections }) => ({
        id,
        productId,
        quantity,
        selections,
      })) ?? []
    );
  }
  function edit(line: PricedLine) {
    const product = catalog.data?.configuration.products.find((item) => item.id === line.productId);
    if (product) {
      updateCart.reset();
      screen.mutate({ section: "menu", productId: product.id });
      setChosen({
        product,
        line,
        configVersion: data.configVersion,
        cartVersion: data.cart.version,
      });
    }
  }
  const voiceActive = view.error === "active" || !["idle", "paused", "error"].includes(view.status);

  return {
    locale,
    t,
    catalog,
    view,
    voice,
    setSnapshot,
    confirmationHeading,
    ordered,
    setOrdered,
    screen,
    section,
    selectedProductId,
    setSection,
    choose,
    selection,
    speed,
    snapshot,
    updateCart,
    prepare,
    submit,
    call,
    language,
    currentLines,
    edit,
    voiceActive,
  };
}
