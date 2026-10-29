import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Users } from "lucide-react";
import { useEffect } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { ParticipantIdentity } from "../../components/user-identity";
import { calendarDate } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { ConsumptionEditor } from "./customer-consumption";
import { OwnedCoupons } from "./customer-coupons";
import {
  customerOrdersOptions,
  customerVisitOptions,
  customerVisitsOptions,
} from "./customer-visit-query";

export function CustomerVisits({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const visits = useInfiniteQuery(customerVisitsOptions(storeId));
  const records = visits.data?.pages.flatMap((page) => page.visits) ?? [];
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("customer_visits")}</h2>
      {visits.isPending ? (
        <LoadingState />
      ) : (
        <>
          <ErrorNotice query={visits} />
          {!visits.data?.pages[0]?.visits.length && !visits.error && (
            <p className="text-muted-foreground">{t("customer_visits_empty")}</p>
          )}
          {([true, false] as const).map((connected) => {
            const group = records.filter(
              (visit) => (visit.status === "open" && !visit.leftAt) === connected,
            );
            return (
              group.length > 0 && (
                <div key={String(connected)} className="space-y-2">
                  <h3 className="text-sm text-muted-foreground">
                    {t(connected ? "customer_current_visit" : "customer_previous_visits")}
                  </h3>
                  <ul className="space-y-2">
                    {group.map((visit) => (
                      <li key={visit.sessionId}>
                        <Link
                          className="flex min-h-20 items-center justify-between gap-4 rounded-xl border border-control-edge bg-control p-4 shadow-control transition-colors hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          to="/member/$storeId/visits/$sessionId"
                          params={{ storeId, sessionId: visit.sessionId }}
                        >
                          <span className="min-w-0">
                            <span className="block font-medium wrap-break-word">
                              {calendarDate(visit.openedAt, locale)} · {visit.tableName}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {t("customer_visit_view")}
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {visit.participants.map((person) => (
                                <ParticipantIdentity
                                  key={person.id}
                                  image={person.image}
                                  name={person.name}
                                />
                              ))}
                            </span>
                          </span>
                          <ArrowRight aria-hidden className="size-4 shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            );
          })}
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

export function CustomerVisit({ storeId, sessionId }: { sessionId: string; storeId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const visit = useSuspenseQuery(customerVisitOptions(storeId, sessionId));
  const orderPages = useInfiniteQuery({
    ...customerOrdersOptions(storeId, sessionId),
    initialData: {
      pages: [
        {
          orders: visit.data.orders,
          nextOrderId: visit.data.nextOrderId,
          nextOrderCursor: visit.data.nextOrderCursor,
        },
      ],
      pageParams: [undefined],
    },
  });
  useEffect(() => {
    const options = customerOrdersOptions(storeId, sessionId);
    const cached = client.getQueryData(options.queryKey);
    if (cached && cached.pages.length > 1) {
      // 続きを開いている場合は全ページを再検証し、境界の移動による欠落を防ぐ。
      void client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    } else {
      client.setQueryData(
        options.queryKey,
        {
          pages: [
            {
              orders: visit.data.orders,
              nextOrderId: visit.data.nextOrderId,
              nextOrderCursor: visit.data.nextOrderCursor,
            },
          ],
          pageParams: [undefined],
        },
        { updatedAt: visit.dataUpdatedAt },
      );
    }
  }, [
    client,
    storeId,
    sessionId,
    visit.dataUpdatedAt,
    visit.data.orders,
    visit.data.nextOrderId,
    visit.data.nextOrderCursor,
  ]);
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
    <article className="space-y-6">
      <header className="space-y-2 border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">{t("customer_visits")}</p>
        <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">
          {calendarDate(data.openedAt, locale)} · {data.tableName}
        </h1>
        <p
          role="status"
          className={data.connected ? "font-medium text-success" : "text-muted-foreground"}
        >
          {t(data.connected ? "customer_table_joined" : "customer_disconnected")}
        </p>
      </header>
      {data.connected && (
        <div className="space-y-3">
          <OwnedCoupons storeId={storeId} sessionId={sessionId} compact />
          <Link
            to="/member/$storeId/coupons"
            params={{ storeId }}
            search={{ sessionId }}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:text-primary"
          >
            {t("customer_coupons_and_rewards")}
            <ArrowRight aria-hidden className="size-4 shrink-0" />
          </Link>
        </div>
      )}
      <ErrorNotice query={visit} />
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users aria-hidden className="size-5" />
          {t("customer_companions")}
        </h2>
        <ul className="space-y-3">
          {data.participants.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-2">
              <span>
                <ParticipantIdentity image={person.image} name={person.name} />
              </span>
              {person.id === data.participantId && <small>{t("customer_you")}</small>}
              {person.leftAt !== null && (
                <small className="text-muted-foreground">{t("customer_disconnected")}</small>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-xl font-semibold">{t("customer_shared_orders")}</h2>
        <p className="text-sm text-muted-foreground">{t("customer_shared_orders_note")}</p>
        {!data.orders.length && <p className="text-muted-foreground">{t("common_empty")}</p>}
        {orderPages.data?.pages.flatMap((page) =>
          page.orders.map((order) => (
            <section key={order.id} className="space-y-2 border-t border-border pt-4">
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
        <ErrorNotice query={orderPages} />
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
      {!leave.isIdle && (
        <ActionFeedback mutation={leave} successMessage={t("customer_disconnected")} />
      )}
      <Link
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        to="/member/$storeId"
        params={{ storeId }}
      >
        {t("customer_card_view")}
      </Link>
    </article>
  );
}
