import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Brand } from "../../components/brand";
import { ErrorNotice } from "../../components/error-notice";
import { KioskPending } from "../../components/kiosk-pending";
import { useI18n } from "../../i18n/locale";
import { tableEndpoint, type TableEndpoint } from "../../lib/api";
import { CurrencyProvider } from "./currency-provider";
import { TableSession } from "./kiosk-session";
import { Landing } from "./landing";
import { tableOptions, tableQueryKey } from "./table-query";

// 遅い応答が新しい画面操作・カート状態を巻き戻さない。
export function Kiosk({ endpoint = tableEndpoint }: { endpoint?: TableEndpoint }) {
  const tableKey = useMemo(() => tableQueryKey(endpoint), [endpoint]);
  const { t } = useI18n();
  const client = useQueryClient();
  const table = useQuery(tableOptions(client, endpoint));
  const [wasConnected, setWasConnected] = useState(Boolean(table.data));
  if (table.data && !wasConnected) setWasConnected(true);
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: tableKey }, { cancelRefetch: false });
  }, [client, tableKey]);
  if ((table.data === null && wasConnected) || table.data?.status === "closed")
    return (
      <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
        <span data-ui="brand" className="inline-flex shrink-0 items-center">
          <Brand />
        </span>
        <h1>{t("kiosk_closed")}</h1>
      </main>
    );
  if (table.data === null) return <Landing />;
  if (table.isPending)
    return (
      <main className="h-dvh">
        <KioskPending />
      </main>
    );
  if (!table.data)
    return (
      <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
        <a data-ui="brand" className="inline-flex shrink-0 items-center" href="/">
          <Brand />
        </a>
        <ErrorNotice error={table.error} onRetry={refresh} />
      </main>
    );
  return (
    <div className="contents" data-pwa-blocked="true">
      <CurrencyProvider
        key={`${endpoint.key}/${table.data.id}`}
        endpoint={endpoint}
        sessionId={table.data.id}
        locale={table.data.locale}
      >
        <TableSession key={table.data.id} endpoint={endpoint} data={table.data} refresh={refresh} />
      </CurrencyProvider>
    </div>
  );
}
