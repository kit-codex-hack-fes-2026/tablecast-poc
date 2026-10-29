import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, LoaderCircle, QrCode, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { ParticipantAvatar } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { type InferResponseType, parseResponse, type TableEndpoint } from "../../lib/api";
import { useMediaQuery } from "../../lib/use-media-query";
import {
  customerParticipantsKey,
  customerParticipantsOptions,
  customerTargetKey,
} from "./customer-participants-query";

export function CustomerVisitPanel({
  endpoint,
  sessionId,
  cursor,
}: {
  cursor: number;
  endpoint: TableEndpoint;
  sessionId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const short = useMediaQuery("(max-height: 36rem) and (min-width: 40rem)");
  const participants = useQuery({
    ...customerParticipantsOptions(endpoint, sessionId, cursor),
    refetchInterval: open ? 10_000 : false,
  });
  const code = useMutation({
    mutationFn: () => parseResponse(endpoint.client["customer-code"].$post()),
    onSuccess: () =>
      client.invalidateQueries(
        { queryKey: customerParticipantsKey(endpoint, sessionId) },
        { cancelRefetch: false },
      ),
  });
  const { mutate: createCode } = code;
  useEffect(() => {
    if (!open || !code.data) return undefined;
    const timer = setTimeout(
      () => createCode(),
      Math.max(0, code.data.expiresAt - Date.now() - 30_000),
    );
    return () => clearTimeout(timer);
  }, [open, code.data, createCode]);
  const people = participants.data?.participants ?? [];
  return (
    <Popover.Root
      open={open}
      modal={false}
      onOpenChange={(next, details) => {
        if (!next && (details.reason === "outside-press" || details.reason === "focus-out")) {
          details.cancel();
          return;
        }
        setOpen(next);
        if (next && (!code.data || code.data.expiresAt <= Date.now())) createCode();
        if (!next) trigger.current?.focus({ preventScroll: true });
      }}
    >
      <Popover.Trigger
        ref={trigger}
        render={
          <Button
            className="h-13.5 min-w-13.5 shrink-0 gap-2 px-3"
            variant="ghost"
            title={t("kiosk_visit_tools")}
            aria-label={t("kiosk_visit_tools")}
          />
        }
      >
        <QrCode aria-hidden className="size-5 shrink-0" />
        <span className="text-sm whitespace-nowrap">{t("customer_member_label")}</span>
        <MemberAvatarStack people={people} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={12}
          collisionPadding={8}
          className="z-50 max-w-[calc(100vw-1rem)]"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={trigger}
            aria-label={t("kiosk_visit_tools")}
            data-ui="customer-visit-popover"
            className={`relative rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl origin-(--transform-origin) transition-[opacity,transform] duration-180 ease-(--motion-ease-out) data-starting-style:scale-97 data-starting-style:opacity-0 data-ending-style:scale-97 data-ending-style:opacity-0 motion-reduce:transform-none motion-reduce:transition-none ${short ? "w-[min(34rem,calc(100vw-1rem))] pt-12" : "w-[min(22rem,calc(100vw-1rem))]"}`}
          >
            <Popover.Arrow className="size-3 rotate-45 border-l border-t border-border bg-popover" />
            <Popover.Title className="sr-only">{t("kiosk_visit_tools")}</Popover.Title>
            <Popover.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-2 top-2"
                  aria-label={t("common_close")}
                />
              }
            >
              <X aria-hidden />
            </Popover.Close>
            <div className={short ? "grid grid-cols-[auto_1fr] items-start gap-3" : "space-y-3"}>
              <VisitQr
                short={short}
                url={code.error ? undefined : code.data?.url}
                pending={code.isPending}
                error={code.error}
                onRetry={createCode}
              />
              <VisitParticipants
                participants={participants}
                endpoint={endpoint}
                sessionId={sessionId}
              />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

type ParticipantResponse = InferResponseType<TableEndpoint["client"]["participants"]["$get"], 200>;
type Participant = ParticipantResponse["participants"][number];

function MemberAvatarStack({ people }: { people: Participant[] }) {
  return people.length ? (
    <span className="flex -space-x-3" aria-hidden data-ui="member-avatar-stack">
      {people.slice(0, 3).map((person) => (
        <ParticipantAvatar key={person.id} image={person.image} />
      ))}
      {people.length > 3 && (
        <span className="relative grid size-9 place-items-center rounded-full bg-card text-xs font-medium ring-1 ring-border">
          +{people.length - 3}
        </span>
      )}
    </span>
  ) : null;
}

function VisitQr({
  short,
  url,
  pending,
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
  pending: boolean;
  short: boolean;
  url?: string;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("customer_join_visit")}
      className={short ? "w-40 space-y-2" : "space-y-2"}
    >
      <h2 className="pr-8 text-center text-sm font-semibold leading-5">
        {t("customer_phone_sign_in")}
      </h2>
      <div
        className={`mx-auto grid place-items-center rounded-xl bg-card ${short ? "size-40" : "size-52"}`}
      >
        {url ? (
          <QRCodeSVG
            value={url}
            size={208}
            marginSize={3}
            className="size-full"
            title={t("customer_join_visit")}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        ) : pending ? (
          <LoaderCircle
            aria-label={t("common_loading")}
            className="size-6 motion-safe:animate-spin"
          />
        ) : (
          <Button variant="outline" disabled={pending} onClick={onRetry}>
            {t("customer_show_qr")}
          </Button>
        )}
      </div>
      <ErrorNotice error={error} />
    </section>
  );
}

function VisitParticipants({
  participants,
  endpoint,
  sessionId,
}: {
  endpoint: TableEndpoint;
  participants: UseQueryResult<ParticipantResponse>;
  sessionId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const selectTarget = useMutation({
    mutationKey: customerTargetKey(endpoint, sessionId),
    mutationFn: (participantId: null | string) =>
      parseResponse(
        endpoint.client["customer-target"].$post({
          json: { participantId, token: participants.data?.context?.token ?? "" },
        }),
      ),
    onSettled: () =>
      client.resetQueries({ queryKey: customerParticipantsKey(endpoint, sessionId) }),
  });
  const people = participants.data?.participants ?? [];
  const target =
    participants.data?.context?.selectedParticipantId ??
    (people.length === 1 ? people[0]?.id : null);
  const pages = Math.ceil(people.length / 4);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const shown = people.slice(currentPage * 4, (currentPage + 1) * 4);
  return (
    <section aria-label={t("customer_joined_guests")} className="space-y-2">
      <h2 className="text-sm font-semibold leading-5">{t("customer_active_members")}</h2>
      {participants.isPending && (
        <LoaderCircle
          aria-label={t("common_loading")}
          className="mx-auto size-5 motion-safe:animate-spin"
        />
      )}
      {participants.isSuccess && !people.length && (
        <p className="text-sm text-muted-foreground">{t("customer_members_empty")}</p>
      )}
      <ul className="grid grid-cols-2 gap-2">
        {shown.map((person) => (
          <li key={person.id} className="min-w-0">
            <Button
              variant={target === person.id ? "outline" : "ghost"}
              className="h-14 w-full min-w-0 justify-start gap-2 px-2"
              title={person.name ?? t("customer_anonymous")}
              aria-pressed={target === person.id}
              disabled={selectTarget.isPending || participants.isFetching}
              onClick={() =>
                selectTarget.mutate(target === person.id && people.length > 1 ? null : person.id)
              }
            >
              <ParticipantAvatar image={person.image} />
              <span className="line-clamp-2 min-w-0 text-left text-sm leading-tight wrap-anywhere">
                {person.name ?? t("customer_anonymous")}
              </span>
              {target === person.id && <Check aria-hidden className="size-3 shrink-0" />}
            </Button>
          </li>
        ))}
      </ul>
      <ParticipantPagination current={currentPage} total={pages} onChange={setPage} />
      <ErrorNotice query={participants} />
      <ErrorNotice error={selectTarget.error} />
    </section>
  );
}

function ParticipantPagination({
  current,
  total,
  onChange,
}: {
  current: number;
  onChange: (page: number) => void;
  total: number;
}) {
  const { t } = useI18n();
  if (total < 2) return null;
  return (
    <nav
      aria-label={t("customer_joined_guests")}
      className="flex items-center justify-center gap-2"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("common_previous_page")}
        disabled={current === 0}
        onClick={() => onChange(current - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <span className="text-xs tabular-nums">
        {current + 1} / {total}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("common_next_page")}
        disabled={current + 1 >= total}
        onClick={() => onChange(current + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
