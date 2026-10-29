import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Check, LoaderCircle, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { ParticipantIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { type InferResponseType, parseResponse, type TableEndpoint } from "../../lib/api";

export function CustomerVisitPanel({
  endpoint,
  sessionId,
  cursor,
  tableName,
  onResume,
  voicePaused,
}: {
  cursor: number;
  endpoint: TableEndpoint;
  onResume: () => void;
  sessionId: string;
  tableName: string;
  voicePaused: boolean;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const participantsKey = ["tablecast-participants", sessionId, endpoint.key];
  const code = useMutation({
    mutationFn: () => parseResponse(endpoint.client["customer-code"].$post()),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: participantsKey }, { cancelRefetch: false }),
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
  const participants = useQuery({
    queryKey: [...participantsKey, cursor],
    enabled: open || cursor > 0,
    staleTime: 30_000,
    gcTime: 30_000,
    queryFn: ({ signal }) =>
      parseResponse(endpoint.client.participants.$get({}, { init: { signal } })),
    refetchInterval: open ? 10_000 : false,
  });
  const people = participants.data?.participants ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && (!code.data || code.data.expiresAt <= Date.now())) createCode();
      }}
    >
      <DialogPrimitive.Trigger
        render={<Button className="h-13.5 shrink-0 gap-2 px-3 text-sm" variant="outline" />}
      >
        <QrCode aria-hidden="true" className="size-5 shrink-0" />
        <span className="max-w-28 whitespace-normal text-start leading-tight">
          {t("kiosk_visit_tools")}
        </span>
        {!!people.length && <span className="tabular-nums">{people.length}</span>}
      </DialogPrimitive.Trigger>
      <DialogContent className="max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("kiosk_visit_tools")}</DialogTitle>
          <DialogClose aria-label={t("common_close")}>×</DialogClose>
        </DialogHeader>
        <DialogDescription>{t("customer_ipad_intro")}</DialogDescription>
        <section
          aria-label={t("customer_join_visit")}
          className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr]"
        >
          <div className="space-y-3 text-center">
            <p className="font-semibold">{tableName}</p>
            <VisitQr
              url={code.error ? undefined : code.data?.url}
              pending={code.isPending}
              onRetry={createCode}
            />
            <p className="mx-auto max-w-60 text-sm text-muted-foreground">
              {t("customer_scan_hint")}
            </p>
            <ErrorNotice error={code.error} />
          </div>
          <ol className="space-y-5">
            {(
              [
                ["customer_step_scan", "customer_step_scan_hint"],
                ["customer_step_register", "customer_step_register_hint"],
                ["customer_step_join", "customer_step_join_hint"],
                ["customer_step_coupon", "customer_step_coupon_hint"],
              ] as const
            ).map(([title, hint], index) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-sm font-semibold">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <p className="font-semibold">{t(title)}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(hint)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <VisitParticipants
          endpoint={endpoint}
          sessionId={sessionId}
          participants={participants}
          voicePaused={voicePaused}
          onResume={() => {
            setOpen(false);
            onResume();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function VisitQr({
  url,
  pending,
  onRetry,
}: {
  onRetry: () => void;
  pending: boolean;
  url?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid size-56 place-items-center rounded-xl bg-card">
      {url ? (
        <QRCodeSVG
          value={url}
          size={224}
          marginSize={3}
          title={t("customer_join_visit")}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      ) : pending ? (
        <LoaderCircle
          aria-label={t("customer_connecting")}
          className="size-8 text-muted-foreground motion-safe:animate-spin"
        />
      ) : (
        <Button className="h-auto min-h-12 whitespace-normal" variant="outline" onClick={onRetry}>
          {t("customer_show_qr")}
        </Button>
      )}
    </div>
  );
}

function ServiceTarget({
  pending,
  person,
}: {
  pending: boolean;
  person?: { name: null | string };
}) {
  const { t } = useI18n();
  return (
    <p className="text-sm text-muted-foreground">
      {t("kiosk_service_target")}{" "}
      <strong className="font-medium text-foreground">
        {pending ? (
          t("kiosk_service_unknown")
        ) : person ? (
          <ParticipantIdentity name={person.name} />
        ) : (
          t("kiosk_service_group")
        )}
      </strong>
    </p>
  );
}

type ParticipantResponse = InferResponseType<TableEndpoint["client"]["participants"]["$get"], 200>;
function VisitParticipants({
  endpoint,
  sessionId,
  participants,
  voicePaused,
  onResume,
}: {
  endpoint: TableEndpoint;
  onResume: () => void;
  participants: UseQueryResult<ParticipantResponse>;
  sessionId: string;
  voicePaused: boolean;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const selectTarget = useMutation({
    mutationFn: (participantId: null | string) =>
      parseResponse(
        endpoint.client["customer-target"].$post({
          json: { participantId, token: participants.data?.context?.token ?? "" },
        }),
      ),
    onSettled: () =>
      client.resetQueries({ queryKey: ["tablecast-participants", sessionId, endpoint.key] }),
  });
  const people = participants.data?.participants ?? [];
  const target =
    participants.data?.context?.selectedParticipantId ??
    (people.length === 1 ? people[0]?.id : null);
  const selectedPerson = people.find((participant) => participant.id === target);
  return (
    <section
      aria-label={t("customer_joined_guests")}
      className="mt-7 space-y-4 border-t border-border pt-5"
    >
      <h3 className="font-semibold">{t("customer_joined_guests")}</h3>
      <ParticipationStatus
        pending={participants.isPending}
        failed={participants.isError}
        count={people.length}
      />
      <ul className="flex flex-wrap gap-2">
        {people.map((person) => (
          <li key={person.id}>
            <Button
              size="sm"
              className="h-auto min-h-11 whitespace-normal px-3 py-2 text-sm"
              variant={target === person.id ? "default" : "outline"}
              aria-pressed={target === person.id}
              disabled={selectTarget.isPending}
              onClick={() => selectTarget.mutate(person.id)}
            >
              <ParticipantIdentity name={person.name} />
            </Button>
          </li>
        ))}
      </ul>
      {!!people.length && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{t("customer_target_hint")}</span>
          {people.length > 1 && (
            <Button
              size="sm"
              className="h-auto min-h-11 whitespace-normal px-3 py-2 text-sm"
              variant={!target ? "default" : "outline"}
              disabled={selectTarget.isPending}
              onClick={() => selectTarget.mutate(null)}
            >
              {t("customer_shared_service")}
            </Button>
          )}
        </div>
      )}
      <ErrorNotice error={selectTarget.error} />
      <ErrorNotice query={participants} />
      <ServiceTarget
        pending={participants.isPending || participants.isError}
        person={selectedPerson}
      />
      {!!people.length && voicePaused && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="min-h-14"
            disabled={selectTarget.isPending || participants.isFetching || participants.isError}
            onClick={() => {
              onResume();
            }}
          >
            {t("customer_resume_service")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("customer_resume_service_hint")}</p>
        </div>
      )}
    </section>
  );
}

function ParticipationStatus({
  pending,
  failed,
  count,
}: {
  count: number;
  failed: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  if (pending || failed) return null;
  return count > 0 ? (
    <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
      <Check aria-hidden className="size-4" />
      {t("customer_table_joined")}
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">{t("customer_waiting_phone")}</p>
  );
}
