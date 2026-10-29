import type { StaffCall } from "@tablecast/api/schema";
import { Popover } from "@base-ui/react/popover";
import { resolveLocalized } from "@tablecast/api/localization";
import {
  ArrowLeft,
  AudioLines,
  Bell,
  ChevronRight,
  History,
  LoaderCircle,
  Mic,
  MicOff,
  X,
} from "lucide-react";
import { useRef } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Money } from "../../components/money";
import { RelativeTime } from "../../components/relative-time";
import { StaffCallDetails } from "../../components/staff-call-details";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { guideTemplates } from "../configuration/guide-model";
import { type AssistanceProps, useStaffAssistance } from "./staff-assistance-state";
import { voiceStatusLabels } from "./voice-model";

const viewLabels = {
  advice: "assistance_title",
  call: "assistance_memo",
  history: "assistance_history",
  topics: "assistance_fallback",
} as const;

export function StaffAssistance(props: AssistanceProps) {
  const { t } = useI18n();
  const model = useStaffAssistance(props);
  const { state, call, close, open, directCall } = model;
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
            className="relative flex max-h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1rem))] origin-(--transform-origin) flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl transition-[opacity,transform] duration-180 ease-(--motion-ease-out) data-starting-style:scale-97 data-starting-style:opacity-0 data-ending-style:scale-97 data-ending-style:opacity-0 motion-reduce:transform-none motion-reduce:transition-none"
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
              role="region"
              aria-label={t(viewLabels[state.tab])}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-3"
              data-ui="staff-assistance-content"
            >
              <AssistanceContent model={model} />
            </div>
            <footer className="shrink-0 space-y-2 border-t border-border p-3">
              <ErrorNotice error={call.error} />
              <p className="sr-only" id="tablecast-assistance-share">
                {t("assistance_share")}
              </p>
              <Button
                className="w-full border-destructive bg-destructive-solid text-on-inverse hover:bg-destructive-solid-hover focus-visible:ring-destructive/40"
                disabled={call.isPending || Boolean(data.staffCall)}
                aria-busy={call.isPending}
                aria-describedby="tablecast-assistance-share"
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

function AssistanceContent({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { t } = useI18n();
  if (model.state.tab === "advice")
    return (
      <>
        <AssistanceAdvice model={model} />
        <RecentCall model={model} />
      </>
    );
  if (model.state.tab === "topics")
    return (
      <>
        <Button variant="ghost" className="w-full justify-start" onClick={model.showAdvice}>
          <ArrowLeft aria-hidden />
          {t("common_back")}
        </Button>
        <h3 className="font-medium">{t("assistance_fallback")}</h3>
        <AssistanceTopics model={model} />
      </>
    );
  if (model.state.tab === "call") {
    const selected = model.calls.find((call) => call.id === model.state.selectedCallId);
    return (
      <>
        <Button variant="ghost" className="w-full justify-start" onClick={model.showHistory}>
          <ArrowLeft aria-hidden />
          {t("assistance_history")}
        </Button>
        {selected ? <StaffCallDetails call={selected} /> : <p>{t("common_loading")}</p>}
      </>
    );
  }
  return (
    <>
      <Button variant="ghost" className="w-full justify-start" onClick={model.begin}>
        <Mic aria-hidden />
        {t("assistance_advice")}
      </Button>
      <AssistanceHistory model={model} />
    </>
  );
}

function AssistanceTopics({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { locale } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      {guideTemplates.map((topic) => (
        <Button
          key={topic.en}
          variant="outline"
          onClick={() => model.selectTopic(resolveLocalized(topic, locale))}
        >
          {resolveLocalized(topic, locale)}
        </Button>
      ))}
    </div>
  );
}

function AssistanceVoice({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { t, locale } = useI18n();
  const { state, view } = model;
  const messages =
    view.messages
      ?.filter((message) => message.createdAt >= state.openedAt && message.text)
      .slice(-2) ?? [];
  const active = !["idle", "paused", "error", "stopping"].includes(view.status);
  const pending = ["connecting", "thinking", "stopping"].includes(view.status);
  const Icon = pending ? LoaderCircle : active ? AudioLines : MicOff;
  return (
    <>
      <div className="flex items-center gap-3 py-2">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon aria-hidden className={pending ? "size-5 motion-safe:animate-spin" : "size-5"} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("assistance_speak")}</p>
          <p role="status" className="text-sm text-muted-foreground">
            {t(voiceStatusLabels[view.status])}
          </p>
        </div>
        {!active && view.status !== "stopping" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("assistance_advice")}
            onClick={model.begin}
          >
            <Mic aria-hidden />
          </Button>
        )}
      </div>
      <div
        role="log"
        aria-label={t("event_conversation")}
        className="space-y-2 text-sm empty:hidden"
      >
        {messages.map((message) => (
          <p
            key={message.id}
            className="line-clamp-3 whitespace-pre-wrap wrap-anywhere"
            lang={message.locale ?? locale}
          >
            <strong>{t(message.role === "user" ? "kiosk_guest" : "kiosk_assistant")}: </strong>
            {message.text}
          </p>
        ))}
      </div>
    </>
  );
}

function AssistanceAdvice({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { t } = useI18n();
  const { state, guidance, guides, products, choose } = model;
  const selected = Boolean(state.selection.guideId || state.selection.query);
  return (
    <>
      <AssistanceVoice model={model} />
      <Button variant="outline" className="w-full justify-between" onClick={model.showTopics}>
        {t("assistance_fallback")}
        <ChevronRight aria-hidden />
      </Button>
      <ErrorNotice
        error={guidance.error}
        onRetry={() =>
          void (guidance.isFetchNextPageError ? guidance.fetchNextPage() : guidance.refetch())
        }
      />
      {selected && guidance.isPending && (
        <LoaderCircle aria-label={t("common_loading")} className="motion-safe:animate-spin" />
      )}
      {guides.map((guide) => (
        <section
          key={guide.id}
          aria-label={guide.text.displayName}
          className="rounded-lg border border-border p-3 space-y-2"
        >
          <h3 className="text-sm font-medium">{guide.text.displayName}</h3>
          <p className="whitespace-pre-wrap text-sm wrap-anywhere">{guide.text.description}</p>
          {guide.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="block min-h-11 py-2 text-sm underline wrap-anywhere"
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
      {selected && !guidance.isPending && !guidance.error && !guides.length && !products.length && (
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

function RecentCall({ model }: { model: ReturnType<typeof useStaffAssistance> }) {
  const { t } = useI18n();
  const recent = model.calls[0];
  return (
    <section aria-label={t("assistance_recent")} className="border-t border-border pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t("assistance_recent")}</h3>
        <Button variant="ghost" size="sm" onClick={model.showHistory}>
          <History aria-hidden />
          {t("assistance_history")}
        </Button>
      </div>
      {recent ? (
        <CallPreview call={recent} onClick={() => model.showCall(recent.id)} />
      ) : (
        !model.history.error && (
          <p className="py-2 text-xs text-muted-foreground">
            {t(model.history.isPending ? "common_loading" : "assistance_empty")}
          </p>
        )
      )}
      <ErrorNotice error={model.history.error} onRetry={() => void model.history.refetch()} />
    </section>
  );
}

function CallPreview({ call, onClick }: { call: StaffCall; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      variant="outline"
      className="h-auto w-full flex-col items-stretch gap-1 whitespace-normal py-3 text-left"
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          <RelativeTime value={call.createdAt} />
        </span>
        <Badge variant={call.status === "pending" ? "warning" : "success"}>
          {t(call.status === "pending" ? "assistance_pending" : "assistance_resolved")}
        </Badge>
        <ChevronRight aria-hidden className="size-4 shrink-0" />
      </span>
      <span
        lang={call.handoff.originalText ? call.handoff.locale : "ja"}
        className="mt-1 line-clamp-2 wrap-anywhere"
      >
        {call.handoff.originalText || call.handoff.summaryJa}
      </span>
    </Button>
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
        <article key={entry.id}>
          <CallPreview call={entry} onClick={() => model.showCall(entry.id)} />
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
