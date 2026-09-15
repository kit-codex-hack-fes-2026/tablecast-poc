import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "../../components/ui/button";
import { ErrorNotice } from "../../components/error-notice";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";

export function CustomerVisitPanel({
  endpoint,
  sessionId,
  cursor,
}: {
  endpoint: TableEndpoint;
  sessionId: string;
  cursor: number;
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
  return (
    <section
      aria-label={t("customer_join_visit")}
      className="flex shrink-0 items-center justify-between gap-5 border-b bg-card px-5 py-3"
    >
      <div className="min-w-0 space-y-2">
        <p className="font-semibold">{t("customer_scan_phone")}</p>
        <p className="text-sm text-muted-foreground">{t("customer_scan_hint")}</p>
        <ul className="flex flex-wrap gap-2">
          {participants.data?.participants.map((person) => (
            <li key={person.id} className="rounded-full bg-muted px-3 py-1 text-sm">
              {person.name ?? t("customer_anonymous")}
            </li>
          ))}
        </ul>
        <ErrorNotice error={participants.error} onRetry={() => void participants.refetch()} />
      </div>
      <div className="shrink-0">
        {code.data && !code.error ? (
          <QRCodeSVG
            value={code.data.url}
            size={112}
            marginSize={2}
            title={t("customer_join_visit")}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        ) : (
          <Button variant="outline" disabled={code.isPending} onClick={() => createCode()}>
            {t("customer_show_qr")}
          </Button>
        )}
        <ErrorNotice error={code.error} />
      </div>
    </section>
  );
}
