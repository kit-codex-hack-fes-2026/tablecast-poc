import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
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
import { parseResponse, type TableEndpoint } from "../../lib/api";

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
  const code = useMutation({
    mutationFn: () => parseResponse(endpoint.client["customer-code"].$post()),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-participants", sessionId] }),
  });
  const { mutate: createCode } = code;
  useEffect(() => {
    createCode();
  }, [createCode]);
  useEffect(() => {
    if (!code.data) return undefined;
    const timer = setTimeout(
      () => createCode(),
      Math.max(0, code.data.expiresAt - Date.now() - 30_000),
    );
    return () => clearTimeout(timer);
  }, [code.data, createCode]);
  const participants = useQuery({
    queryKey: ["tablecast-participants", sessionId, cursor],
    gcTime: 0,
    queryFn: ({ signal }) =>
      parseResponse(endpoint.client.participants.$get({}, { init: { signal } })),
    refetchInterval: 10_000,
  });
  const selectTarget = useMutation({
    mutationFn: (participantId: null | string) =>
      parseResponse(
        endpoint.client["customer-target"].$post({
          json: { participantId, token: participants.data?.context?.token ?? "" },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-participants", sessionId] }),
  });
  const target =
    participants.data?.context?.selectedParticipantId ??
    (participants.data?.participants.length === 1 ? participants.data.participants[0]?.id : null);
  const selectedPerson = participants.data?.participants.find(
    (participant) => participant.id === target,
  );
  return (
    <Dialog>
      <DialogPrimitive.Trigger
        render={<Button variant="ghost" size="icon" title={t("kiosk_visit_tools")} />}
      >
        <QrCode aria-hidden="true" />
        <span className="sr-only">{t("kiosk_visit_tools")}</span>
      </DialogPrimitive.Trigger>
      <DialogContent className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("kiosk_visit_tools")}</DialogTitle>
          <DialogClose aria-label={t("common_close")}>×</DialogClose>
        </DialogHeader>
        <DialogDescription>{t("customer_scan_hint")}</DialogDescription>
        <span className="text-sm text-muted-foreground">
          {t("kiosk_service_target")}{" "}
          <strong className="font-medium text-foreground">
            {participants.isPending || participants.isError ? (
              t("kiosk_service_unknown")
            ) : selectedPerson ? (
              <ParticipantIdentity name={selectedPerson.name} />
            ) : (
              t("kiosk_service_group")
            )}
          </strong>
        </span>
        <section aria-label={t("customer_join_visit")} className="mt-4 flex flex-col gap-5">
          <div className="min-w-0 space-y-2">
            <p className="font-semibold">{t("customer_scan_phone")}</p>
            <p className="text-sm text-muted-foreground">{t("customer_scan_hint")}</p>
            <ul className="flex flex-wrap gap-2">
              {participants.data?.participants.map((person) => (
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
            {!!participants.data?.participants.length && (
              <div className="flex items-center gap-3 text-sm">
                <span>{t("customer_target_hint")}</span>
                {participants.data.participants.length > 1 && (
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
            <ErrorNotice error={participants.error} onRetry={() => void participants.refetch()} />
          </div>
          <div className="self-center">
            <div className="grid min-h-48 w-48 items-center justify-center">
              {code.data && !code.error ? (
                <QRCodeSVG
                  value={code.data.url}
                  size={192}
                  marginSize={2}
                  title={t("customer_join_visit")}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              ) : (
                <Button
                  className="h-auto min-h-12 whitespace-normal"
                  variant="outline"
                  disabled={code.isPending}
                  onClick={() => createCode()}
                >
                  {t("customer_show_qr")}
                </Button>
              )}
            </div>
            <ErrorNotice error={code.error} />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
