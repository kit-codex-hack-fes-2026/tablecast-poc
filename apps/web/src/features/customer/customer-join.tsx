import { apiError } from "../../lib/api-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerVisitOptions } from "./customer-visit-query";
import { CustomerConsent } from "./customer-store";

export function CustomerJoin({ code }: { code: string }) {
  const { t } = useI18n();
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
  if (destination.isPending) return <LoadingState />;
  if (destination.error)
    return (
      <section className="space-y-4">
        <p>{t("customer_scan_again")}</p>
        <ErrorNotice error={destination.error} />
      </section>
    );
  if (!destination.data) return null;
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{destination.data.storeName}</h1>
        <p className="mt-2 text-muted-foreground">{destination.data.tableName}</p>
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
        <CustomerConsent
          storeId={destination.data.storeId}
          onEnrolled={() => {
            void destination.refetch();
          }}
        />
      )}
    </section>
  );
}
