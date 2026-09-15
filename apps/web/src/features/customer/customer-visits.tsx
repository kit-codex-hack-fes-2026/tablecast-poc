import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ConsumptionEditor } from "./customer-consumption";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import {
  customerOrdersOptions,
  customerVisitOptions,
  customerVisitsOptions,
} from "./customer-visit-query";

const visitDate = {
  ja: new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Tokyo" }),
};

export function CustomerVisits({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const visits = useInfiniteQuery(customerVisitsOptions(storeId));
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("customer_visits")}</h2>
      {visits.isPending ? (
        <LoadingState />
      ) : (
        <>
          <ErrorNotice error={visits.error} onRetry={() => void visits.refetch()} />
          {!visits.data?.pages[0]?.visits.length && !visits.error && (
            <p className="text-muted-foreground">{t("customer_visits_empty")}</p>
          )}
          <ul className="space-y-3">
            {visits.data?.pages.flatMap((page) =>
              page.visits.map((visit) => (
                <li key={visit.sessionId}>
                  <Link
                    className="flex items-center justify-between gap-4 rounded-xl border p-4"
                    to="/member/$storeId/visits/$sessionId"
                    params={{ storeId, sessionId: visit.sessionId }}
                  >
                    <span>
                      {visitDate[locale].format(visit.openedAt)} · {visit.tableName}
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {visit.participants
                          .map((person) => person.name ?? t("customer_anonymous"))
                          .join(" · ")}
                      </span>
                    </span>
                    {visit.status === "open" && !visit.leftAt && (
                      <span className="text-sm text-success">{t("customer_connected")}</span>
                    )}
                  </Link>
                </li>
              )),
            )}
          </ul>
          {visits.hasNextPage && (
            <Button
              variant="outline"
              disabled={visits.isFetchingNextPage}
              onClick={() => void visits.fetchNextPage()}
            >
              {t("customer_more")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export function CustomerVisit({ storeId, sessionId }: { storeId: string; sessionId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const visit = useSuspenseQuery(customerVisitOptions(storeId, sessionId));
  const orderPages = useInfiniteQuery({
    ...customerOrdersOptions(storeId, sessionId),
    initialData: {
      pages: [{ orders: visit.data.orders, nextOrderId: visit.data.nextOrderId }],
      pageParams: [undefined],
    },
  });
  const leave = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].visits[":sessionId"].leave.$post({
          param: { storeId, sessionId },
        }),
      ),
    onSuccess: async (data) => {
      client.setQueryData(customerVisitOptions(storeId, sessionId).queryKey, data);
      await client.invalidateQueries({
        queryKey: ["tablecast-customer", storeId, "visits"],
        exact: true,
      });
    },
  });
  const data = visit.data;
  return (
    <article className="space-y-7">
      <Link
        to="/member/$storeId/coupons"
        params={{ storeId }}
        search={{ sessionId }}
        className="inline-flex rounded-lg border px-4 py-3 font-medium"
      >
        {t("coupons")}
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{data.storeName}</h1>
        <p className="text-muted-foreground">
          {visitDate[locale].format(data.openedAt)} · {data.tableName}
        </p>
        <p
          role="status"
          className={data.connected ? "font-medium text-success" : "text-muted-foreground"}
        >
          {t(data.connected ? "customer_connected" : "customer_disconnected")}
        </p>
      </header>
      <ErrorNotice error={visit.error} onRetry={() => void visit.refetch()} />
      <section className="space-y-3 rounded-2xl border p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users aria-hidden className="size-5" />
          {t("customer_companions")}
        </h2>
        <ul className="space-y-3">
          {data.participants.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-2">
              <span>{person.name ?? t("customer_anonymous")}</span>
              {person.id === data.participantId && <small>{t("customer_you")}</small>}
              {person.leftAt !== null && (
                <small className="text-muted-foreground">{t("customer_disconnected")}</small>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("customer_shared_orders")}</h2>
        <p className="text-sm text-muted-foreground">{t("customer_shared_orders_note")}</p>
        {!data.orders.length && <p className="text-muted-foreground">{t("common_empty")}</p>}
        {orderPages.data?.pages.flatMap((page) =>
          page.orders.map((order) => (
            <section key={order.id} className="space-y-2 rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">{t(`order_${order.status}`)}</p>
              <ul className="space-y-2">
                {order.snapshot.lines.map((line) => (
                  <li key={line.id} className="space-y-2">
                    <span>{line.name[locale]}</span>
                    <span> × {line.quantity}</span>
                    <ConsumptionEditor
                      storeId={storeId}
                      orderId={order.id}
                      lineId={line.id}
                      {...order.personalRecords.find((record) => record.lineId === line.id)}
                      key={`${line.id}:${order.personalRecords.find((record) => record.lineId === line.id)?.revision ?? 0}`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )),
        )}
        <ErrorNotice error={orderPages.error} onRetry={() => void orderPages.refetch()} />
        {orderPages.hasNextPage && (
          <Button
            variant="outline"
            disabled={orderPages.isFetchingNextPage}
            onClick={() => void orderPages.fetchNextPage()}
          >
            {t("customer_more")}
          </Button>
        )}
      </section>
      {data.connected && (
        <Button variant="outline" disabled={leave.isPending} onClick={() => leave.mutate()}>
          {t("customer_leave_visit")}
        </Button>
      )}
      <ActionFeedback
        pending={leave.isPending}
        error={leave.error}
        success={leave.isSuccess}
        successMessage={t("customer_disconnected")}
      />
      <Link className="text-sm underline" to="/member/$storeId" params={{ storeId }}>
        {t("customer_card")}
      </Link>
    </article>
  );
}
