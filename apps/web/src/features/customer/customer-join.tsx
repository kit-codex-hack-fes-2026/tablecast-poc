import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, QrCode } from "lucide-react";
import { useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { ProductImage } from "../../components/product-image";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { CustomerConsent } from "./customer-store";
import { customerVisitOptions } from "./customer-visit-query";

export function CustomerJoin({ code }: { code: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const destination = useQuery({
    queryKey: ["tablecast-customer", "join", code],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.customer.visits.resolve.$post({ json: { code } }, { init: { signal } }),
      ),
    retry: false,
  });
  const { mutate, isIdle, isPending, error } = useMutation({
    mutationFn: () => parseResponse(rpc.api.customer.visits.join.$post({ json: { code } })),
    onSuccess: async (visit) => {
      client.setQueryData(customerVisitOptions(visit.storeId, visit.sessionId).queryKey, visit);
      await client.invalidateQueries({
        queryKey: ["tablecast-customer", visit.storeId, "visits"],
        exact: true,
      });
      await navigate({
        to: "/member/$storeId/visits/$sessionId",
        params: { storeId: visit.storeId, sessionId: visit.sessionId },
        replace: true,
      });
    },
  });
  useEffect(() => {
    if (destination.data?.membership?.active && isIdle) mutate();
  }, [destination.data?.membership?.active, isIdle, mutate]);
  const needsLogin = apiError(destination.error ?? error)?.status === 401;
  useEffect(() => {
    if (needsLogin)
      void navigate({
        to: "/login",
        search: { returnTo: `/member/join?code=${encodeURIComponent(code)}` },
        replace: true,
      });
  }, [needsLogin, navigate, code]);
  if (destination.isPending || needsLogin) return <LoadingState />;
  if (destination.error)
    return (
      <section className="space-y-5">
        {apiError(destination.error)?.code === "CUSTOMER_VISIT_CODE_EXPIRED" ? (
          <div
            role="alert"
            className="flex items-start gap-4 rounded-2xl border border-warning-border bg-warning-soft p-5"
          >
            <QrCode aria-hidden="true" className="size-8 shrink-0 text-warning" />
            <p className="text-pretty leading-relaxed">{t("customer_scan_again")}</p>
          </div>
        ) : (
          <ErrorNotice query={destination} retrying={destination.isFetching} />
        )}
        <Button variant="outline" nativeButton={false} role="link" render={<Link to="/member" />}>
          <ArrowLeft aria-hidden="true" />
          {t("customer_title")}
        </Button>
      </section>
    );
  if (!destination.data) return null;
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        {destination.data.branding?.logo && (
          <ProductImage
            src={`/api/member-stores/${encodeURIComponent(destination.data.storeId)}/images/${destination.data.branding.logo.imageKey}`}
            alt={destination.data.branding.logo.alt[locale]}
            width={56}
            height={56}
            sizes="56px"
            priority
            className="size-14 shrink-0 rounded-xl object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="mb-2 text-sm text-muted-foreground">{t("customer_join_destination")}</p>
          <h1 className="text-xl font-semibold wrap-anywhere">{destination.data.storeName}</h1>
          <p className="mt-2 text-muted-foreground">{destination.data.tableName}</p>
        </div>
      </div>
      {destination.data.membership?.active ? (
        <>
          {isPending && <p role="status">{t("customer_connecting")}</p>}
          {error && (
            <>
              <ErrorNotice error={error} />
              <Button onClick={() => mutate()}>{t("common_retry")}</Button>
            </>
          )}
        </>
      ) : (
        <>
          <ol
            aria-label={t("customer_join_flow")}
            className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground"
          >
            <li>{t("customer_join_register_step")}</li>
            <li>{t("customer_join_table_step")}</li>
            <li>{t("customer_join_coupon_step")}</li>
          </ol>
          <CustomerConsent
            storeId={destination.data.storeId}
            onEnrolled={() => {
              void destination.refetch();
            }}
          />
        </>
      )}
    </section>
  );
}
