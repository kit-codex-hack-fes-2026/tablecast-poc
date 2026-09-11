import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MonitorSmartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { useI18n } from "../../i18n/locale";

import { parseResponse, rpc } from "../../lib/api";

export function Pairing({ onReady }: { onReady: () => void }) {
  const { t, setLocale } = useI18n();
  const request = useMutation({
    mutationFn: () => parseResponse(rpc.api.devices.request.$post()),
  });
  const deviceCode = request.data?.device_code;
  const poll = useQuery({
    queryKey: ["tablecast-device-poll", deviceCode],
    queryFn: deviceCode
      ? () => parseResponse(rpc.api.devices.poll.$post({ json: { device_code: deviceCode } }))
      : skipToken,
    enabled: !!request.data,
    refetchInterval: (query) =>
      query.state.data?.ready ? false : (request.data?.interval ?? 5) * 1000,
  });
  useEffect(() => {
    if (poll.data?.ready) onReady();
  }, [poll.data?.ready, onReady]);
  return (
    <main className="min-h-dvh" data-pwa-blocked={Boolean(request.data) || request.isPending}>
      <header className="flex items-center justify-between py-6 px-9 max-sm:p-6">
        <a
          data-ui="brand"
          className="inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight max-lg:text-2xl"
          href="/"
        >
          TableCast<span className="text-accent ml-px text-4xl">·</span>
        </a>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <div className="mt-12 mx-auto mb-10 max-w-144 p-10 flex items-center flex-col text-center [&_>_[data-slot=button][data-size=text]]:mt-7 [&_>_[data-slot=button][data-size=text]]:text-muted-foreground max-sm:py-5 max-sm:px-6 max-sm:mt-9">
        <span className="flex items-center justify-center bg-secondary text-muted-foreground rounded-full mb-6 size-24">
          <MonitorSmartphone size={36} strokeWidth={1.3} />
        </span>
        <h1 className="text-3xl mt-3 max-sm:text-2xl">{t("pair_title")}</h1>
        <p className="text-muted-foreground text-sm leading-loose mt-5 mx-0 mb-7">
          {t("pair_note")}
        </p>
        {request.data ? (
          <>
            <QRCodeSVG
              className="mb-5 rounded-xl bg-white p-3"
              value={`${request.data.verification_uri}?user_code=${encodeURIComponent(request.data.user_code)}`}
              size={208}
              level="M"
              title={t("admin_pair")}
            />
            <output
              className="text-4xl tracking-widest tabular-nums bg-card border border-border py-4 px-6 rounded-lg"
              aria-label={t("admin_pair_code")}
            >
              {request.data.user_code}
            </output>
            <div className="text-muted-foreground text-xs mt-5 flex items-center gap-2">
              <span className="inline-block bg-current rounded-full shrink-0 size-1.5" />
              {t("pair_waiting")}
            </div>
          </>
        ) : (
          <Button
            variant="default"
            size="lg"
            type="button"

            onClick={() => request.mutate()}
            disabled={request.isPending}
          >
            {t("pair_begin")}
          </Button>
        )}
        <ErrorNotice error={request.error || poll.error} onRetry={() => request.mutate()} />
        <Link
          data-slot="button"
          data-size="text"
          className={buttonVariants({ variant: "link", size: "text" })}
          to="/login"
        >
          {t("auth_subtitle")}
        </Link>
      </div>
    </main>
  );
}
