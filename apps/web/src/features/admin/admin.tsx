import { authClient } from "../../lib/auth-client";
import { Button } from "../../components/ui/button";
import { adminStateSchema } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Activity, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { storesSchema } from "../../lib/responses";
import { useRealtime } from "../../lib/use-realtime";
import { AdminShell } from "./admin-shell";
import { ApproveDevice } from "./approve-device";
import { OpenTable } from "./open-table";
import { SettingsDrafts } from "./settings-drafts";
import { TableDetail } from "./table-detail";
import { TableMetrics } from "./table-metrics";
import { TableTimeline } from "./table-timeline";
import { VisitHistory } from "./visit-history";

export function Admin() {
  const { t, setLocale } = useI18n();
  const navigate = useNavigate();
  const search = useSearch({ from: "/admin/live" });
  const client = useQueryClient();
  const [storeId, setStoreId] = useState(search.storeId);
  const [selected, setSelected] = useState<string>();
  const [pairOpen, setPairOpen] = useState(false);
  const [opening, setOpening] = useState<{ id: string; name: string }>();
  const tab = search.draftId ? "settings" : (search.section ?? "live");
  const active = authClient.useActiveOrganization();
  const stores = useQuery({
    queryKey: ["tablecast-stores"],
    queryFn: () => api("/api/admin/stores", {}, storesSchema),
  });
  const visibleStores =
    stores.data?.stores.filter(
      (store) => !active.data?.id || store.organizationId === active.data.id,
    ) ?? [];
  const currentStore =
    visibleStores.find((store) => store.id === storeId)?.id ?? visibleStores[0]?.id;
  const state = useQuery({
    queryKey: ["tablecast-admin", currentStore],
    queryFn: () => api(`/api/admin/stores/${currentStore}`, {}, adminStateSchema),
    enabled: !!currentStore,
    refetchInterval: 30_000,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["tablecast-admin", currentStore] });
    void client.invalidateQueries({ queryKey: ["tablecast-admin-catalog", currentStore] });
    void client.invalidateQueries({ queryKey: ["tablecast-table-detail"] });
    void client.invalidateQueries({ queryKey: ["tablecast-session-events", currentStore] });
    void client.invalidateQueries({ queryKey: ["tablecast-visit-history", currentStore] });
  };
  const connected = useRealtime(
    currentStore ? `/api/admin/stores/${currentStore}` : undefined,
    state.data?.cursor ?? 0,
    refresh,
  );
  const signOut = useMutation({
    mutationFn: () => api("/api/auth/sign-out", json("POST", {})),
    onSuccess: () => {
      client.clear();
      void navigate({ to: "/login" });
    },
  });
  useEffect(() => {
    const saved = localStorage.getItem("tablecast_staff_locale");
    if (saved === "ja" || saved === "en") setLocale(saved);
  }, [setLocale]);
  useEffect(() => {
    if (stores.error instanceof ApiFailure && stores.error.status === 401)
      void navigate({
        to: "/login",
        search: { returnStoreId: search.storeId, returnDraftId: search.draftId },
      });
  }, [stores.error, navigate, search.storeId, search.draftId]);
  const tables = state.data?.tables ?? [];
  return (
    <AdminShell
      tab={tab}
      onTabChange={(section) => {
        void navigate({ to: "/admin/live", search: { storeId: currentStore, section } });
      }}
      onPair={() => setPairOpen(true)}
      pairDisabled={!currentStore}
      onSignOut={() => signOut.mutate()}
      signingOut={signOut.isPending}
      header={
        <div className="store-selector [&_.eyebrow]:text-sm">
          <label>
            <span className="sr-only">{t("admin_store")}</span>
            <NativeSelect
              className="pt-0.5 pr-6 pb-0.5 pl-0 border-0 min-h-9 bg-transparent text-base font-semibold max-sm:max-w-44 max-sm:text-base"
              value={currentStore ?? ""}
              onChange={(event) => {
                setStoreId(event.target.value);
                setSelected(undefined);
              }}
            >
              {visibleStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      }
    >
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {tab === "live"
              ? t("admin_live")
              : tab === "history"
                ? t("admin_history")
                : t("admin_config")}
          </h1>
        </div>
        <span
          data-state={connected ? "connected" : ""}
          className="flex items-center gap-1.5 text-muted-foreground text-sm max-w-40 [&[data-state=connected]]:text-success max-lg:max-w-none"
        >
          <span className="inline-block w-1.5 h-1.5 bg-current rounded-full shrink-0" />
          {connected ? t("admin_live_connected") : t("admin_live_reconnecting")}
        </span>
      </section>
      <ErrorNotice
        error={stores.error || state.error || signOut.error}
        onRetry={() => {
          void stores.refetch();
          refresh();
        }}
      />
      {!stores.isPending && visibleStores.length === 0 && (
        <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-input p-6 text-center">
          <Building2 className="size-10" />
          <h2>{t("auth_no_stores")}</h2>
          <p className="max-w-lg text-base text-muted-foreground">{t("org_empty_hint")}</p>
          <Button render={<Link to="/organisations" />}>
            <Building2 />
            {t("org_manage")}
          </Button>
        </div>
      )}
      {currentStore &&
        (tab === "live" ? (
          <>
            <TableMetrics tables={tables} vacantCount={state.data?.vacantTables.length ?? 0} />
            <section className="border border-border bg-card rounded-lg overflow-hidden">
              <div className="flex justify-between items-center py-5 px-5 border-b border-b-border">
                <h2 className="text-base flex items-center gap-2">
                  <Activity size={19} aria-hidden="true" />
                  {t("admin_timeline")}
                </h2>
                <span className="text-sm text-muted-foreground tracking-widest">
                  {tables.length + (state.data?.vacantTables.length ?? 0)} {t("admin_table_count")}
                </span>
              </div>
              {state.data && (
                <TableTimeline
                  key={currentStore}
                  tables={tables}
                  vacantTables={state.data?.vacantTables}
                  onSelect={setSelected}
                  onOpen={setOpening}
                />
              )}
            </section>
          </>
        ) : tab === "history" ? (
          currentStore && (
            <VisitHistory key={currentStore} storeId={currentStore} onSelect={setSelected} />
          )
        ) : (
          currentStore && (
            <SettingsDrafts
              key={`${currentStore}:${currentStore === search.storeId ? (search.draftId ?? "") : ""}`}
              storeId={currentStore}
              initialDraftId={currentStore === search.storeId ? search.draftId : undefined}
            />
          )
        ))}
      {selected && currentStore && (
        <TableDetail
          key={`${currentStore}:${selected}`}
          storeId={currentStore}
          tableId={selected}
          onClose={() => setSelected(undefined)}
          onUpdate={refresh}
        />
      )}
      {opening && currentStore && (
        <OpenTable
          storeId={currentStore}
          table={opening}
          onClose={() => setOpening(undefined)}
          onOpened={() => {
            setOpening(undefined);
            refresh();
          }}
        />
      )}
      {pairOpen && state.data && (
        <ApproveDevice state={state.data} onClose={() => setPairOpen(false)} />
      )}
    </AdminShell>
  );
}
