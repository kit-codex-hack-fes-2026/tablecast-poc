import type { TableState } from "@tablecast/api/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, ChevronRight } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { RelativeTime } from "../../components/relative-time";
import { StaffCallMemo } from "../../components/staff-call-details";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";

/** フロアと卓詳細で、未対応の全文と対応済み操作を同じ場所に置く。 */
export function PendingStaffCall({
  table,
  initialNow,
  onSelect,
}: {
  initialNow: number;
  onSelect?: (sessionId: string) => void;
  table: TableState;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const { storeId, id } = table;
  const action = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].call.resolve.$post({
          param: { storeId, id },
          json: { callId: table.staffCall?.id },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["tablecast-admin", storeId] }),
        client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, id] }),
        client.invalidateQueries({ queryKey: ["tablecast-session-events", storeId, id] }),
        client.invalidateQueries({ queryKey: ["tablecast-floor-timeline", storeId] }),
      ]);
    },
  });
  return (
    <article
      aria-label={`${table.tableName} · ${t("assistance_pending")}`}
      className="overflow-hidden rounded-xl border border-border bg-background text-foreground"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-subtle px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <BellRing className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-xl font-semibold wrap-anywhere">{table.tableName}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
              <Badge variant="warning">{t("assistance_pending")}</Badge>
              {table.staffCall && (
                <>
                  <span aria-hidden>·</span>
                  <RelativeTime value={table.staffCall.createdAt} initialNow={initialNow} />
                </>
              )}
            </p>
          </div>
        </div>
        {table.status === "open" && (
          <Button
            variant="outline"
            className="border-success-border bg-success-soft text-success shadow-none hover:border-success-border-hover hover:bg-success-hover"
            disabled={action.isPending}
            aria-busy={action.isPending}
            onClick={() => action.mutate()}
          >
            <Check aria-hidden />
            {t("admin_acknowledge")}
          </Button>
        )}
      </header>
      <div className="space-y-4 p-5">
        {table.staffCall ? (
          <StaffCallMemo call={table.staffCall} />
        ) : (
          <p className="text-sm">{t("staff_call_unconfirmed")}</p>
        )}
        <ErrorNotice error={action.error} />
        {onSelect && (
          <Button variant="link" size="text" onClick={() => onSelect(table.id)}>
            {t("staff_call_open_table")}
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </article>
  );
}
