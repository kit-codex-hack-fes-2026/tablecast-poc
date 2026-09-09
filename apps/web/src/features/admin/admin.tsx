import { adminStateSchema } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { storesSchema } from "../../lib/responses";
import { useRealtime } from "../../lib/use-realtime";
import { AdminSidebar } from "./admin-sidebar";
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
  const [tab, setTab] = useState<"live" | "history" | "settings">(
    search.draftId ? "settings" : "live",
  );
  const stores = useQuery({
    queryKey: ["tablecast-stores"],
    queryFn: () => api("/api/admin/stores", {}, storesSchema),
  });
  const currentStore = storeId ?? stores.data?.stores[0]?.id;
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
    <div className="admin-shell min-h-dvh flex max-sm:block">
      <AdminSidebar
        tab={tab}
        onTabChange={setTab}
        onPair={() => setPairOpen(true)}
        pairDisabled={!currentStore}
        onSignOut={() => signOut.mutate()}
        signingOut={signOut.isPending}
      />
      <main className="flex-1 min-w-0 pt-0 px-8 pb-10 max-xl:px-6 max-lg:px-4">
        <header className="min-h-28 flex items-center justify-between gap-4 border-b border-b-border max-sm:min-h-24">
          <div className="store-selector [&_.eyebrow]:text-xs">
            <label>
              <span className="sr-only">{t("admin_store")}</span>
              <NativeSelect
                className="pt-0.5 pr-6 pb-0.5 pl-0 border-0 min-h-9 bg-transparent text-base font-semibold max-sm:max-w-44 max-sm:text-sm"
                value={currentStore ?? ""}
                onChange={(event) => {
                  setStoreId(event.target.value);
                  setSelected(undefined);
                }}
              >
                {stores.data?.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <LanguageSwitch
            onChange={(next) => {
              setLocale(next);
              localStorage.setItem("tablecast_staff_locale", next);
            }}
          />
        </header>
        <section className="flex justify-between items-end gap-5 pt-8 px-0 pb-6 [&_.eyebrow]:tracking-wide max-lg:items-start max-lg:flex-col max-lg:gap-3 max-sm:pt-6">
          <div>
            <h1 className="text-3xl mt-2 max-sm:text-2xl">
              {tab === "live"
                ? t("admin_live")
                : tab === "history"
                  ? t("admin_history")
                  : t("admin_config")}
            </h1>
          </div>
          <span
            data-state={connected ? "connected" : ""}
            className="flex items-center gap-1.5 text-muted-foreground text-xs max-w-40 [&[data-state=connected]]:text-success max-lg:max-w-none"
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
        {stores.data?.stores.length === 0 && (
          <div className="py-12 px-6 text-muted-foreground text-center">{t("auth_no_stores")}</div>
        )}
        {tab === "live" ? (
          <>
            <TableMetrics tables={tables} vacantCount={state.data?.vacantTables.length ?? 0} />
            <section className="border border-border bg-card rounded-lg overflow-hidden">
              <div className="flex justify-between items-center py-5 px-5 border-b border-b-border">
                <h2 className="text-sm flex items-center gap-2">
                  <Activity size={19} aria-hidden="true" />
                  {t("admin_timeline")}
                </h2>
                <span className="text-xs text-muted-foreground tracking-widest">
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
        )}
      </main>
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
    </div>
  );
}
