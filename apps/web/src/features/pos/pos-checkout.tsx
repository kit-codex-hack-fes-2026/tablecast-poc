import type { PosCheckoutView } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import { CircleDollarSign, Eye, Link2, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { BillSummary } from "../../components/bill-summary";
import { CartLines } from "../../components/cart-lines";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { SquareLogo } from "../../components/square-logo";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { PosIssues } from "./pos-issues";
import { posCheckoutOptions } from "./pos-query";

type CheckoutAction =
  | { expectedVersion: number; idempotencyKey: string; kind: "start" }
  | { kind: "cancel" | "preview" | "reconcile" };

export function PosCheckout({ storeId, sessionId }: { sessionId: string; storeId: string }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const client = useQueryClient();
  const query = useQuery(posCheckoutOptions(storeId, sessionId));
  const [expanded, setExpanded] = useState(false);
  const attempt = useRef<null | { key: string; version: number }>(null);
  const endpoint = rpc.api.admin.stores[":storeId"].tables[":id"].pos;
  const param = { storeId, id: sessionId };
  const action = useMutation({
    mutationFn: (operation: CheckoutAction) => {
      if (operation.kind === "start")
        return parseResponse(
          endpoint.start.$post({
            param,
            json: {
              expectedVersion: operation.expectedVersion,
              idempotencyKey: operation.idempotencyKey,
            },
          }),
        );
      if (operation.kind === "preview") return parseResponse(endpoint.preview.$post({ param }));
      if (operation.kind === "cancel") return parseResponse(endpoint.cancel.$post({ param }));
      return parseResponse(endpoint.reconcile.$post({ param }));
    },
    onSuccess: async (next, operation) => {
      if (operation.kind === "preview") setExpanded(true);
      if (operation.kind === "start") setExpanded(false);
      client.setQueryData(posCheckoutOptions(storeId, sessionId).queryKey, next);
      if (next.checkout?.status === "cancelled") attempt.current = null;
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["tablecast-table-detail", storeId, sessionId],
          exact: true,
        }),
        client.invalidateQueries({ queryKey: ["tablecast-admin", storeId] }),
      ]);
    },
    onError: () =>
      client.invalidateQueries({ queryKey: posCheckoutOptions(storeId, sessionId).queryKey }),
  });
  const data = query.data;
  const pending = action.isPending || !hydrated;
  function start() {
    if (!data?.canStart || !data.invoice) return;
    if (!attempt.current || attempt.current.version !== data.invoice.version)
      attempt.current = { key: crypto.randomUUID(), version: data.invoice.version };
    action.mutate({
      kind: "start",
      expectedVersion: data.invoice.version,
      idempotencyKey: attempt.current.key,
    });
  }
  return (
    <section aria-label={t("pos_checkout")} className="space-y-4 border-t border-border py-6">
      <ErrorNotice query={query} retrying={query.isFetching} />
      {query.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("common_loading")}
        </p>
      )}
      {data && (
        <>
          {!data.connection && (
            <div className="space-y-3">
              <Button
                nativeButton={false}
                role="link"
                variant="outline"
                render={<Link to="/admin/stores/$storeId/pos" params={{ storeId }} />}
              >
                <Link2 aria-hidden="true" />
                {t("pos_title")}
              </Button>
            </div>
          )}
          <PosCheckoutSummary data={data} expanded={expanded} onExpandedChange={setExpanded} />
          {data.connection && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={pending || !data.connection || data.locked}
                onClick={() => action.mutate({ kind: "preview" })}
              >
                <Eye aria-hidden="true" />
                {t("pos_preview")}
              </Button>
              <Button type="button" disabled={pending || !data.canStart} onClick={start}>
                <CircleDollarSign aria-hidden="true" />
                {t("pos_start")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || !data.canReconcile}
                onClick={() => action.mutate({ kind: "reconcile" })}
              >
                <RefreshCw aria-hidden="true" />
                {t("pos_reconcile")}
              </Button>
              {data.canCancel && (
                <ConfirmAction
                  label={t("pos_cancel")}
                  subject={t("pos_cancel_description")}
                  disabled={pending}
                  icon={<X aria-hidden="true" />}
                  onConfirm={() => action.mutate({ kind: "cancel" })}
                />
              )}
            </div>
          )}
        </>
      )}
      <ActionFeedback mutation={action} successMessage={t("pos_checkout_updated")} />
    </section>
  );
}

export function PosCheckoutSummary({
  data,
  expanded = false,
  onExpandedChange,
}: {
  data: PosCheckoutView;
  expanded?: boolean;
  onExpandedChange?: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const { checkout, invoice } = data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="p-3">
          <SquareLogo />
        </h2>
        {checkout && (
          <p role="status">
            <Badge
              variant={
                checkout.status === "completed"
                  ? "success"
                  : checkout.status === "review"
                    ? "warning"
                    : checkout.status === "cancelled"
                      ? "inactive"
                      : "info"
              }
            >
              {t(`pos_checkout_${checkout.status}`)}
            </Badge>
          </p>
        )}
      </div>
      {data.locked && <p className="text-sm text-muted-foreground">{t("pos_locked")}</p>}
      {checkout?.status === "review" && checkout.issue !== "POS_UNKNOWN_OUTCOME" && (
        <p className="text-sm text-warning">{t("pos_review_hint")}</p>
      )}
      <PosIssues
        issues={[
          ...data.issues,
          ...(checkout?.issue && !data.issues.some((issue) => issue.code === checkout.issue)
            ? [{ code: checkout.issue }]
            : []),
        ]}
      />
      {invoice && (
        <details
          open={expanded}
          onToggle={(event) => onExpandedChange?.(event.currentTarget.open)}
          className="space-y-4"
        >
          <summary className="cursor-pointer text-sm underline underline-offset-4">
            {t("pos_details")}
          </summary>
          <CartLines
            variant="receipt"
            lines={invoice.lines.map((line) => ({
              id: line.id,
              productId: line.productId,
              name: line.displayName ?? { ja: line.name, en: line.name },
              transliteration: line.transliteration,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              total: line.total,
              foodInformation: line.foodInformation,
              options: line.options.map((option) => ({
                id: option.id,
                name: option.displayName ?? { ja: option.name, en: option.name },
                quantity: option.quantity,
                priceDelta: option.price,
              })),
            }))}
          />
          <BillSummary
            rows={invoice.adjustments.map((adjustment) => ({
              id: adjustment.id,
              label: adjustment.name,
              amount: adjustment.amount,
            }))}
            total={{ label: t("common_total"), amount: invoice.total }}
          />
        </details>
      )}
    </div>
  );
}
