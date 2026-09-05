import { Button } from "../../components/ui/button";
import { pairingStatusSchema, pairingCodeSchema } from "../../lib/responses";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MonitorSmartphone } from "lucide-react";
import { useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";

export function Pairing({ onReady }: { onReady: () => void }) {
  const { t, setLocale } = useI18n();
  const request = useMutation({
    mutationFn: () => api("/api/devices/request", json("POST", {}), pairingCodeSchema),
  });
  const poll = useQuery({
    queryKey: ["tablecast-device-poll", request.data?.device_code],
    queryFn: () =>
      api(
        "/api/devices/poll",
        json("POST", { device_code: request.data?.device_code }),
        pairingStatusSchema,
      ),
    enabled: !!request.data,
    refetchInterval: (query) =>
      query.state.data?.ready ? false : (request.data?.interval ?? 5) * 1000,
  });
  useEffect(() => {
    if (poll.data?.ready) onReady();
  }, [poll.data?.ready, onReady]);
  return (
    <main className="pair-page">
      <header className="simple-header">
        <a className="brand" href="/">
          TableCast<span>·</span>
        </a>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <div className="pair-card">
        <span className="pair-icon">
          <MonitorSmartphone size={36} strokeWidth={1.3} />
        </span>
        <h1>{t("pair_title")}</h1>
        <p>{t("pair_note")}</p>
        {request.data ? (
          <>
            <output className="pair-code" aria-label={t("admin_pair_code")}>
              {request.data.user_code}
            </output>
            <div className="pair-waiting">
              <span className="tiny-dot" />
              {t("pair_waiting")}
            </div>
          </>
        ) : (
          <Button
            variant="default"
            size="lg"
            type="button"
            className="primary-button"
            onClick={() => request.mutate()}
            disabled={request.isPending}
          >
            {t("pair_begin")}
          </Button>
        )}
        <ErrorNotice error={request.error || poll.error} onRetry={() => request.mutate()} />
        <Link className="text-button" to="/login">
          {t("auth_subtitle")}
        </Link>
      </div>
    </main>
  );
}
