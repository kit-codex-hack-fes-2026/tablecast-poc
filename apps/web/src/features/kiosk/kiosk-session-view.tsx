import type { TableState } from "@tablecast/api/schema";
import { useEffect, useRef } from "react";
import { usePanelRef } from "react-resizable-panels";
import { ErrorNotice } from "../../components/error-notice";
import { StoreTheme } from "../../components/store-theme";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import * as Tabs from "../../components/ui/tabs";
import { type TableEndpoint } from "../../lib/api";
import { useMediaQuery } from "../../lib/use-media-query";
import { usePanelLayout } from "../../lib/use-panel-layout";
import { conversationLines } from "./conversation-model";
import { KioskCart, KioskMenu } from "./kiosk-cart";
import { KioskCheckout } from "./kiosk-checkout";
import { KioskHeader, KioskMenuTabs, KioskVisitTools } from "./kiosk-header";
import { KioskBilling, KioskOrders, KioskPlanSummary } from "./kiosk-orders";
import { useTableSession } from "./kiosk-session";
import { KioskVoicePanel } from "./kiosk-voice-panel";

export function TableSession({
  data,
  refresh,
  endpoint,
}: {
  data: TableState;
  endpoint: TableEndpoint;
  refresh: () => void;
}) {
  const horizontal = useMediaQuery("(min-width: 56rem)");
  const conversationPanel = usePanelRef();
  const orientation = useRef(horizontal);
  const { defaultLayout, onLayoutChanged } = usePanelLayout({
    id: horizontal ? "tablecast-kiosk-layout" : "tablecast-kiosk-vertical-layout",
    panelIds: ["tablecast-conversation", "tablecast-order"],
  });
  useEffect(() => {
    if (orientation.current === horizontal) return;
    orientation.current = horizontal;
    const savedSize = defaultLayout?.["tablecast-conversation"];
    conversationPanel.current?.resize(
      savedSize === undefined ? (horizontal ? "240px" : "360px") : `${savedSize}%`,
    );
  }, [conversationPanel, defaultLayout, horizontal]);
  const model = useTableSession({ data, refresh, endpoint });
  const {
    snapshot,
    locale,
    t,
    catalog,
    view,
    voice,
    screen,
    section,
    selectedProductId,
    setSection,
    choose,
    speed,
    updateCart,
    prepare,
    call,
    language,
    voiceActive,
  } = model;
  const toggleVoice = () => {
    if (voiceActive) void voice.stop({ existingSession: view.error === "active" });
    else void voice.start(locale, data.speechSpeed);
  };
  return (
    <StoreTheme appearance={catalog.data?.configuration.appearance}>
      <div
        data-theme-part="screen"
        data-ui="kiosk-shell"
        className="h-dvh flex flex-col overflow-hidden"
      >
        <KioskHeader
          storeName={catalog.data?.configuration.storeName}
          logo={catalog.data?.configuration.branding?.logo}
          data={data}
          language={language}
          call={call}
          tools={<KioskVisitTools data={data} endpoint={endpoint} stopVoice={() => voice.stop()} />}
        />
        <div data-ui="kiosk-content" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ResizablePanelGroup
            orientation={horizontal ? "horizontal" : "vertical"}
            className="min-h-128 flex-1 max-sm:flex-col!"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
          >
            <ResizablePanel
              id="tablecast-conversation"
              panelRef={conversationPanel}
              groupResizeBehavior="preserve-pixel-size"
              defaultSize={horizontal ? "240px" : "360px"}
              minSize={horizontal ? "224px" : "344px"}
              maxSize="70%"
              className="h-full"
            >
              <KioskVoicePanel
                voice={voice}
                lines={conversationLines(data.events)}
                events={data.events}
                catalog={catalog.data}
                snapshot={data.snapshot}
                onReview={
                  data.snapshot?.channel === "gui" || (snapshot && section === "cart")
                    ? undefined
                    : () => (snapshot ? setSection("cart") : prepare.mutate())
                }
                reviewPending={prepare.isPending}
                onChoose={choose}
                onStart={toggleVoice}
                controlDisabled={view.status === "stopping" || language.isPending}
                speechSpeed={speed.isPending ? speed.variables : data.speechSpeed}
                onSpeedChange={(value) => speed.mutate(value)}
                onMicrophoneChange={(deviceId) => {
                  void voice.selectMicrophone(deviceId);
                }}
                onMicrophoneRefresh={() => {
                  void voice.refreshMicrophones();
                }}
              />
            </ResizablePanel>
            <ResizableHandle aria-label={t("kiosk_resize_panes")} />
            <ResizablePanel id="tablecast-order" minSize="30%" className="h-full">
              <aside
                data-theme-part="menu"
                className="isolate overflow-hidden h-full min-w-0 min-h-0 flex flex-col bg-card"
              >
                <KioskPlanSummary plan={data.plan} />
                <ErrorNotice error={screen.error} />
                <Tabs.Root
                  className="flex flex-col min-h-0 flex-1"
                  value={section}
                  onValueChange={(value: unknown) => {
                    if (
                      value === "menu" ||
                      value === "cart" ||
                      value === "orders" ||
                      value === "bill"
                    )
                      setSection(value);
                  }}
                >
                  <KioskMenuTabs data={data} />
                  <div
                    key={`${section}:${selectedProductId ?? ""}`}
                    className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
                  >
                    <KioskMenu model={model} />
                    <KioskCart data={data} model={model} />
                    <KioskOrders data={data} catalog={catalog} endpoint={endpoint} />
                    <KioskBilling data={data} call={call} />
                  </div>
                </Tabs.Root>
                <ErrorNotice
                  error={
                    updateCart.error || prepare.error || call.error || language.error || speed.error
                  }
                />
                <KioskCheckout data={data} model={model} />
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </StoreTheme>
  );
}
