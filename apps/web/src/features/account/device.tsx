import { adminStateSchema } from "@tablecast/api/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { ErrorNotice } from "../../components/error-notice";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";
import { storesSchema } from "../../lib/responses";
import { authClient } from "../../lib/auth-client";
import { SettingsShell } from "./settings-shell";

export function DeviceApproval() {
  const { t } = useI18n();
  const session = authClient.useSession();
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get("user_code") ?? "",
  );
  const [storeId, setStoreId] = useState("");
  const [tableId, setTableId] = useState("");
  const stores = useQuery({
    queryKey: ["tablecast-stores"],
    queryFn: () => api("/api/admin/stores", {}, storesSchema),
    enabled: !!session.data,
  });
  const selected = storeId || stores.data?.stores[0]?.id;
  const state = useQuery({
    queryKey: ["tablecast-admin", selected],
    queryFn: () => api(`/api/admin/stores/${selected}`, {}, adminStateSchema),
    enabled: !!selected,
  });
  const approve = useMutation({
    mutationFn: () =>
      api(
        `/api/admin/stores/${selected}/devices/approve`,
        json("POST", { userCode: code, tableId }),
      ),
  });
  return (
    <SettingsShell>
      <section className="space-y-5 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t("admin_pair")}</h1>
        {approve.isSuccess ? (
          <output>{t("account_saved")}</output>
        ) : (
          <form
            className="grid max-w-sm gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              approve.mutate();
            }}
          >
            <label>
              {t("admin_pair_code")}
              <Input
                required
                maxLength={30}
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </label>
            <label>
              {t("admin_store")}
              <NativeSelect
                value={selected ?? ""}
                onChange={(event) => {
                  setStoreId(event.target.value);
                  setTableId("");
                }}
              >
                {stores.data?.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label>
              {t("admin_pair_table")}
              <NativeSelect
                required
                value={tableId}
                onChange={(event) => setTableId(event.target.value)}
              >
                <option value="">—</option>
                {state.data?.tables
                  .filter((table) => table.status === "open")
                  .map((table) => (
                    <option key={table.id} value={table.tableId}>
                      {table.tableName}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <Button type="submit" disabled={approve.isPending || !tableId}>
              {t("admin_approve")}
            </Button>
          </form>
        )}
        <ErrorNotice error={approve.error || stores.error || state.error} />
      </section>
    </SettingsShell>
  );
}
