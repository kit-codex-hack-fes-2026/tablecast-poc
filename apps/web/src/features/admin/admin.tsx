import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { storesSchema, draftsSchema } from "../../lib/responses";
import { adminStateSchema, catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { Dialog } from "@base-ui/react/dialog";
import type { AdminState, ConfigDraft } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Radio,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { TableDetail } from "./table-detail";
import { TableTimeline } from "./table-timeline";

export function Admin() {
  const { t, setLocale } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [storeId, setStoreId] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [pairOpen, setPairOpen] = useState(false);
  const [opening, setOpening] = useState<{ id: string; name: string }>();
  const [tab, setTab] = useState<"live" | "settings">("live");
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
    void client.invalidateQueries({ queryKey: ["tablecast-table-detail"] });
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
      void navigate({ to: "/login" });
  }, [stores.error, navigate]);
  const tables = state.data?.tables ?? [];
  const billing = tables.filter(
    (table) => table.events.some((event) => event.kind === "bill.requested") && table.bill.due > 0,
  ).length;
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand" to="/admin/live">
          TableCast<span>·</span>
        </Link>
        <nav aria-label={t("admin_live")}>
          <Button
            variant="ghost"
            type="button"
            aria-current={tab === "live" ? "page" : undefined}
            onClick={() => setTab("live")}
          >
            <LayoutDashboard size={19} aria-hidden="true" />
            {t("admin_live")}
          </Button>
          <Button
            variant="ghost"
            type="button"
            aria-current={tab === "settings" ? "page" : undefined}
            onClick={() => setTab("settings")}
          >
            <Settings2 size={19} aria-hidden="true" />
            {t("admin_config")}
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setPairOpen(true)}
            disabled={!currentStore}
          >
            <MonitorSmartphone size={19} aria-hidden="true" />
            {t("admin_pair")}
          </Button>
        </nav>
        <div className="sidebar-bottom">
          <Link to="/">
            {t("auth_guest")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Button
            variant="ghost"
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            <LogOut size={16} aria-hidden="true" />
            {t("auth_sign_out")}
          </Button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div className="store-selector">
            <label>
              <span className="sr-only">{t("admin_store")}</span>
              <select
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
              </select>
            </label>
          </div>
          <LanguageSwitch
            onChange={(next) => {
              setLocale(next);
              localStorage.setItem("tablecast_staff_locale", next);
            }}
          />
        </header>
        <section className="admin-page-heading">
          <div>
            <h1>{tab === "live" ? t("admin_live") : t("admin_config")}</h1>
          </div>
          <span className={`live-status ${connected ? "connected" : ""}`}>
            <span className="tiny-dot" />
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
          <div className="empty-note">{t("auth_no_stores")}</div>
        )}
        {tab === "live" ? (
          <>
            <div className="admin-metrics">
              <div className="metric">
                <Users size={20} aria-hidden="true" />
                <span>{t("admin_active")}</span>
                <strong>
                  {tables.filter((table) => table.status === "open").length}
                  <small>/ {tables.length + (state.data?.vacantTables.length ?? 0)}</small>
                </strong>
              </div>
              <div className="metric attention">
                <Bell size={20} aria-hidden="true" />
                <span>{t("admin_attention")}</span>
                <strong>{tables.filter((table) => table.staffCalled).length}</strong>
              </div>
              <div className="metric">
                <CircleDollarSign size={20} aria-hidden="true" />
                <span>{t("admin_billing")}</span>
                <strong>{billing}</strong>
              </div>
              <div className="metric">
                <Radio size={20} aria-hidden="true" />
                <span>{t("admin_voice_errors")}</span>
                <strong>{tables.filter((table) => table.voiceState === "error").length}</strong>
              </div>
            </div>
            <section className="floor-panel">
              <div className="floor-panel-heading">
                <h2>
                  <Activity size={19} aria-hidden="true" />
                  {t("admin_timeline")}
                </h2>
                <span>
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
        ) : (
          currentStore && <SettingsDrafts storeId={currentStore} />
        )}
      </main>
      {selected && currentStore && (
        <TableDetail
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

function OpenTable({
  storeId,
  table,
  onClose,
  onOpened,
}: {
  storeId: string;
  table: { id: string; name: string };
  onClose: () => void;
  onOpened: () => void;
}) {
  const { t, locale } = useI18n();
  const [guests, setGuests] = useState(2);
  const [guestLocale, setGuestLocale] = useState("ja");
  const [plan, setPlan] = useState("");
  const catalog = useQuery({
    queryKey: ["tablecast-admin-catalog", storeId],
    queryFn: () => api(`/api/admin/stores/${storeId}/catalog`, {}, catalogSchema),
  });
  const open = useMutation({
    mutationFn: () =>
      api(
        `/api/admin/stores/${storeId}/tables/open`,
        json("POST", {
          tableId: table.id,
          guestCount: guests,
          locale: guestLocale,
          ...(plan ? { planId: plan } : {}),
        }),
      ),
    onSuccess: onOpened,
  });
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog">
            <div className="dialog-heading">
              <span className="eyebrow">{table.name}</span>
              <Dialog.Close className="icon-button" aria-label={t("common_close")}>
                <X size={22} />
              </Dialog.Close>
            </div>
            <Dialog.Title>{t("admin_open_table")}</Dialog.Title>
            <form
              className="stacked-form"
              onSubmit={(event) => {
                event.preventDefault();
                open.mutate();
              }}
            >
              <label>
                {t("admin_guest_count")}
                <Input
                  type="number"
                  min={1}
                  max={30}
                  required
                  value={guests}
                  onChange={(event) => setGuests(Number(event.target.value))}
                />
              </label>
              <label>
                {t("admin_locale")}
                <select
                  value={guestLocale}
                  onChange={(event) => setGuestLocale(event.target.value)}
                >
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {t("kiosk_plan")}
                <select value={plan} onChange={(event) => setPlan(event.target.value)}>
                  <option value="">{t("admin_no_plan")}</option>
                  {catalog.data?.configuration.plans.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.text[locale].displayName}
                    </option>
                  ))}
                </select>
              </label>
              <ErrorNotice error={open.error || catalog.error} />
              <Button
                variant="default"
                size="lg"
                type="submit"
                className="primary-button"
                disabled={open.isPending}
              >
                {t("admin_open_table")}
              </Button>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ApproveDevice({ state, onClose }: { state: AdminState; onClose: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [tableId, setTableId] = useState(state.tables[0]?.tableId ?? "");
  const approve = useMutation({
    mutationFn: () =>
      api(
        `/api/admin/stores/${state.store.id}/devices/approve`,
        json("POST", { userCode: code, tableId }),
      ),
    onSuccess: onClose,
  });
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog">
            <div className="dialog-heading">
              <Dialog.Close className="icon-button" aria-label={t("common_close")}>
                <X size={22} />
              </Dialog.Close>
            </div>
            <Dialog.Title>{t("admin_pair")}</Dialog.Title>
            <Dialog.Description>{t("pair_note")}</Dialog.Description>
            <form
              className="stacked-form"
              onSubmit={(event) => {
                event.preventDefault();
                approve.mutate();
              }}
            >
              <label>
                {t("admin_pair_code")}
                <Input
                  autoComplete="off"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  required
                  maxLength={30}
                />
              </label>
              <label>
                {t("admin_pair_table")}
                <select
                  value={tableId}
                  onChange={(event) => setTableId(event.target.value)}
                  required
                >
                  {state.tables
                    .filter((table) => table.status === "open")
                    .map((table) => (
                      <option key={table.id} value={table.tableId}>
                        {table.tableName}
                      </option>
                    ))}
                </select>
              </label>
              <ErrorNotice error={approve.error} />
              <Button
                variant="default"
                size="lg"
                type="submit"
                className="primary-button"
                disabled={approve.isPending || !tableId}
              >
                {t("admin_approve")}
              </Button>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsDrafts({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const base = `/api/admin/stores/${storeId}/drafts`;
  const drafts = useQuery({
    queryKey: ["tablecast-drafts", storeId],
    queryFn: () => api(base, {}, draftsSchema),
  });
  const [selected, setSelected] = useState<ConfigDraft>();
  const validate = useMutation({
    mutationFn: (draft: ConfigDraft) =>
      api(
        `${base}/${draft.id}/validate`,
        json("POST", { expectedVersion: draft.version }),
        configDraftSchema,
      ),
    onSuccess: (draft) => {
      setSelected(draft);
      void drafts.refetch();
    },
  });
  const [publishKey, setPublishKey] = useState(() => crypto.randomUUID());
  const publish = useMutation({
    mutationFn: (draft: ConfigDraft) =>
      api(
        `${base}/${draft.id}/publish`,
        json("POST", {
          expectedVersion: draft.version,
          baseVersion: draft.baseVersion,
          idempotencyKey: publishKey,
          approved: true,
        }),
        configDraftSchema,
      ),
    onSuccess: () => {
      setSelected(undefined);
      setPublishKey(crypto.randomUUID());
      void drafts.refetch();
    },
  });
  return (
    <section className="settings-panel">
      <h2>{t("admin_drafts")}</h2>
      <p>{t("admin_draft_note")}</p>
      <ErrorNotice error={drafts.error || validate.error || publish.error} />
      {drafts.data?.drafts
        .filter((draft) => draft.status === "draft" || draft.status === "ready")
        .map((draft) => (
          <div key={draft.id} className="draft-card">
            <div>
              <strong>
                v{draft.baseVersion} → v{draft.version}
              </strong>
              <p>
                {draft.changes.length} {t("admin_change_count")}
              </p>
            </div>
            <Button
              variant="outline"
              type="button"
              className="secondary-button"
              onClick={() => {
                setSelected(draft);
                setPublishKey(crypto.randomUUID());
              }}
            >
              {t("kiosk_review")}
            </Button>
          </div>
        ))}
      {drafts.data?.drafts.every(
        (draft) => draft.status !== "draft" && draft.status !== "ready",
      ) && <p className="empty-note">{t("admin_no_drafts")}</p>}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Viewport className="dialog-viewport">
            <Dialog.Popup className="dialog config-dialog">
              <div className="dialog-heading">
                <Dialog.Close className="icon-button" aria-label={t("common_close")}>
                  <X size={22} />
                </Dialog.Close>
              </div>
              <Dialog.Title>{t("admin_config")}</Dialog.Title>
              <Dialog.Description>{t("admin_draft_note")}</Dialog.Description>
              {selected && (
                <>
                  <div className="dialog-scroll">
                    {selected.changes.some((change) => change.sensitive) && (
                      <div className="notice">{t("admin_sensitive")}</div>
                    )}
                    {selected.errors.length > 0 && (
                      <ul className="validation-errors">
                        {selected.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    )}
                    {selected.changes.map((change) => (
                      <div className="config-change" key={change.path}>
                        <strong>{change.path}</strong>
                        <div>
                          <section>
                            <h4>{t("admin_before")}</h4>
                            <pre>{JSON.stringify(change.before, null, 2)}</pre>
                          </section>
                          <section>
                            <h4>{t("admin_after")}</h4>
                            <pre>{JSON.stringify(change.after, null, 2)}</pre>
                          </section>
                        </div>
                      </div>
                    ))}
                  </div>
                  <ErrorNotice error={validate.error || publish.error} />
                  <div className="dialog-actions">
                    <Button
                      variant="outline"
                      type="button"
                      className="secondary-button"
                      disabled={validate.isPending || publish.isPending}
                      onClick={() => validate.mutate(selected)}
                    >
                      {t("admin_validate")}
                    </Button>
                    <Button
                      variant="default"
                      size="lg"
                      type="button"
                      className="primary-button"
                      disabled={
                        selected.status !== "ready" ||
                        selected.errors.length > 0 ||
                        publish.isPending ||
                        validate.isPending
                      }
                      onClick={() => publish.mutate(selected)}
                    >
                      {t("admin_publish")}
                    </Button>
                  </div>
                </>
              )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
