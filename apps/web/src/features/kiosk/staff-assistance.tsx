import { Popover } from "@base-ui/react/popover";
import { Bell, History, LoaderCircle, X } from "lucide-react";
import { useRef } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Money } from "../../components/money";
import { StaffCallDetails } from "../../components/staff-call-details";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { guideTemplates } from "../configuration/guide-model";
import { type AssistanceProps, useStaffAssistance } from "./staff-assistance-state";

export function StaffAssistance(props: AssistanceProps) {
  const { t } = useI18n();
  const model = useStaffAssistance(props);
  const { state, call, begin, close, open, directCall, showHistory } = model;
  const { data } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover.Root
      open={state.open}
      modal={false}
      onOpenChange={(next, details) => {
        if (!next && (details.reason === "outside-press" || details.reason === "focus-out")) {
          details.cancel();
          return;
        }
        if (next) open();
        else {
          close();
          trigger.current?.focus({ preventScroll: true });
        }
      }}
    >
      <Popover.Trigger
        ref={trigger}
        render={
          <Button
            variant="outline"
            size="sm"
            data-ui="call-staff"
            className="h-13.5 min-h-13.5 shrink-0 whitespace-nowrap px-2"
          />
        }
      >
        <Bell aria-hidden />
        <span>{data.staffCall ? t("assistance_pending") : t("kiosk_call_staff")}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={12}
          collisionPadding={8}
          className="z-50 max-w-[calc(100vw-1rem)]"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={trigger}
            aria-label={t("assistance_title")}
            data-ui="staff-assistance"
            className="relative flex max-h-[min(42rem,calc(100dvh-6rem))] w-[min(28rem,calc(100vw-1rem))] origin-(--transform-origin) flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl transition-[opacity,transform] duration-180 ease-(--motion-ease-out) data-starting-style:scale-97 data-starting-style:opacity-0 data-ending-style:scale-97 data-ending-style:opacity-0 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <Popover.Arrow className="size-3 rotate-45 border-l border-t border-border bg-popover" />
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3">
              <Popover.Title className="font-semibold">{t("assistance_title")}</Popover.Title>
              <Popover.Close
                render={<Button variant="ghost" size="icon-sm" aria-label={t("common_close")} />}
              >
                <X aria-hidden />
              </Popover.Close>
            </header>
            <div
              role="group"
              aria-label={t("assistance_title")}
              className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-2"
            >
              <Button
                aria-pressed={state.tab === "advice"}
                variant={state.tab === "advice" ? "secondary" : "ghost"}
                onClick={() => {
                  if (state.tab !== "advice") begin();
                }}
              >
                {t("assistance_advice")}
              </Button>
              <Button
                aria-pressed={state.tab === "history"}
                variant={state.tab === "history" ? "secondary" : "ghost"}
                onClick={showHistory}
              >
                <History aria-hidden />
                {t("assistance_history")}
              </Button>
            </div>
            <div
              role="region"
              aria-label={t(state.tab === "advice" ? "assistance_advice" : "assistance_history")}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-4"
              data-ui="staff-assistance-content"
            >
              {state.tab === "advice" ? (
                <>
                  <AssistanceAdvice model={model} />
                </>
              ) : (
                <>
                  {" "}
                  <AssistanceHistory model={model} />
                </>
              )}
            </div>
            <footer className="shrink-0 space-y-2 border-t border-border p-3">
              <ErrorNotice error={call.error} />
              <p className="text-xs text-muted-foreground">{t("assistance_share")}</p>
              <Button
                className="w-full border-destructive bg-destructive-solid text-on-inverse hover:bg-destructive-solid-hover focus-visible:ring-destructive/40"
                disabled={call.isPending || Boolean(data.staffCall)}
                aria-busy={call.isPending}
                onClick={directCall}
              >
                {call.isPending ? (
                  <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <Bell aria-hidden />
                )}
                {t(data.staffCall ? "assistance_pending" : "assistance_direct")}
              </Button>
            </footer>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AssistanceAdvice({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { t, locale } = useI18n();
  const { state, view, guidance, guides, products, selectTopic, choose } = model;
  const messages =
    view.messages
      ?.filter((message) => message.createdAt >= state.openedAt && message.text)
      .slice(-4) ?? [];
  return (
    <>
      {" "}
      <p className="text-sm text-muted-foreground">{t("assistance_voice_unavailable")}</p>
      <div className="flex flex-wrap gap-2">
        {guideTemplates.map((topic) => (
          <Button
            key={topic.en}
            variant="outline"
            size="sm"
            onClick={() => selectTopic(topic[locale])}
          >
            {topic[locale]}
          </Button>
        ))}
      </div>
      <div role="log" aria-label={t("event_conversation")} className="space-y-2 text-sm">
        {messages.map((message) => (
          <p
            key={message.id}
            className="whitespace-pre-wrap wrap-anywhere"
            lang={message.locale ?? locale}
          >
            <strong>{t(message.role === "user" ? "kiosk_guest" : "kiosk_assistant")}: </strong>
            {message.text}
          </p>
        ))}
      </div>
      <ErrorNotice
        error={guidance.error}
        onRetry={() =>
          void (guidance.isFetchNextPageError ? guidance.fetchNextPage() : guidance.refetch())
        }
      />
      {guidance.isPending && (
        <LoaderCircle aria-label={t("common_loading")} className="motion-safe:animate-spin" />
      )}
      {guides.map((guide) => (
        <section key={guide.id} className="rounded-xl border border-border p-3 space-y-2">
          <h3 className="font-semibold">{guide.text.displayName}</h3>
          <p className="whitespace-pre-wrap text-sm wrap-anywhere">{guide.text.description}</p>
          {guide.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="block min-h-11 py-2 underline wrap-anywhere"
            >
              {link.label}
            </a>
          ))}
        </section>
      ))}
      {products.map((product) => (
        <Button
          key={product.id}
          variant="outline"
          className="w-full justify-between text-left"
          disabled={!product.available}
          onClick={() => choose(product.id)}
        >
          <span>{product.text.displayName}</span>
          <span className="shrink-0">
            <Money value={product.price} taxIncluded />
            {!product.available && ` · ${t("kiosk_sold_out")}`}
          </span>
        </Button>
      ))}
      {!guidance.isPending && !guidance.error && !guides.length && !products.length && (
        <p className="text-sm text-muted-foreground">{t("assistance_no_answer")}</p>
      )}
      {guidance.hasNextPage && (
        <Button
          variant="outline"
          disabled={guidance.isFetching}
          onClick={() => void guidance.fetchNextPage()}
        >
          {t("assistance_more_guides")}
        </Button>
      )}
    </>
  );
}
function AssistanceHistory({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { t } = useI18n();
  const { history, calls } = model;
  return (
    <>
      <ErrorNotice
        error={history.error}
        onRetry={() =>
          void (history.isFetchNextPageError ? history.fetchNextPage() : history.refetch())
        }
      />
      {history.isPending && (
        <LoaderCircle aria-label={t("common_loading")} className="motion-safe:animate-spin" />
      )}
      {!history.isPending && !history.error && !calls.length && <p>{t("assistance_empty")}</p>}
      {calls.map((entry) => (
        <article key={entry.id} className="rounded-xl border border-border p-3">
          <StaffCallDetails call={entry} />
        </article>
      ))}
      {history.hasNextPage && (
        <Button
          variant="outline"
          disabled={history.isFetching}
          onClick={() => void history.fetchNextPage()}
        >
          {t("assistance_more")}
        </Button>
      )}
    </>
  );
}
