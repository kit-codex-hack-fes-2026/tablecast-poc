import type { PosCatalog, PosSettings } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { resolveLocalized } from "@tablecast/api/localization";
import { useStore as useFormStore } from "@tanstack/react-form";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useBlocker, useHydrated, useNavigate } from "@tanstack/react-router";
import { Link2, Link2Off, RefreshCw, Save } from "lucide-react";
import { useId, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { SubmitButton } from "../../components/form/fields";
import { PageHeader } from "../../components/page-header";
import { SquareLogo } from "../../components/square-logo";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { SaveStatus } from "../configuration/configuration-status";
import { ConfigurationToolbar } from "../configuration/configuration-toolbar";
import { StartConfigurationEditing } from "../configuration/configuration-workflow";
import { useStore } from "../store/store-context";
import { PosDevicePicker } from "./pos-devices";
import { PosIssues } from "./pos-issues";
import { type PosMappingRow, posMappingValues } from "./pos-mapping-model";
import { PosMappingTable } from "./pos-mapping-table";
import { posCatalogOptions, posSettingsOptions } from "./pos-query";

const liveValues = (settings: PosSettings) => ({
  expectedRevision: settings.connection?.revision ?? 0,
  locationId: settings.connection?.locationId ?? "",
  deviceId: settings.connection?.deviceId ?? "",
});
const mappingValues = (settings: PosSettings) => ({
  connectionId: settings.mappingConnectionId ?? settings.connection?.id ?? "",
  mappings: posMappingValues(settings),
});

export function StorePos({ draftId }: { draftId?: string }) {
  const store = useStore();
  const navigate = useNavigate();
  const query = useSuspenseQuery(posSettingsOptions(store.id, draftId));
  const canEdit = store.role === "owner" || store.role === "admin";
  return (
    <>
      <ErrorNotice query={query} retrying={query.isFetching} />
      <StorePosSettings
        key={`${query.data.connection?.id ?? "disconnected"}:${draftId ?? "published"}`}
        storeId={store.id}
        settings={query.data}
        canEdit={canEdit}
        actions={
          !draftId && canEdit ? (
            <StartConfigurationEditing
              section="products"
              onSelect={(id) =>
                void navigate({
                  to: "/admin/stores/$storeId/pos",
                  params: { storeId: store.id },
                  search: { draftId: id },
                })
              }
            />
          ) : undefined
        }
      />
    </>
  );
}

export function StorePosSettings({
  storeId,
  settings,
  canEdit,
  actions,
}: {
  actions?: ReactNode;
  canEdit: boolean;
  settings: PosSettings;
  storeId: string;
}) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const client = useQueryClient();
  const endpoint = rpc.api.admin.stores[":storeId"].pos;
  const mutationKey = ["tablecast-pos-live", storeId];
  const pending = useIsMutating({ mutationKey }) > 0;
  const refresh = () => client.invalidateQueries({ queryKey: ["tablecast-pos-settings", storeId] });
  function receiveLive(next: PosSettings) {
    client.setQueriesData<PosSettings>(
      { queryKey: ["tablecast-pos-settings", storeId] },
      (previous) =>
        previous
          ? {
              ...previous,
              connection: next.connection,
              configured: next.configured,
              legacyMappings: next.legacyMappings,
            }
          : previous,
    );
    void refresh();
  }
  const connect = useMutation({
    mutationKey,
    mutationFn: () => parseResponse(endpoint.oauth.$post({ param: { storeId } })),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: refresh,
  });
  const disconnect = useMutation({
    mutationKey,
    mutationFn: () => parseResponse(endpoint.$delete({ param: { storeId } })),
    onSuccess: receiveLive,
    onError: refresh,
  });
  const connected = settings.connection?.status === "connected";
  const catalog = useQuery({
    ...posCatalogOptions(storeId, settings.connection?.locationId ?? ""),
    enabled: canEdit && connected,
  });
  return (
    <section className="@container space-y-6">
      <PageHeader title={t("pos_title")} actions={actions} />
      <PosConnectionSettings
        settings={settings}
        canEdit={canEdit}
        pending={pending || !hydrated}
        connect={connect}
        disconnect={disconnect}
      />
      {!canEdit && <p className="text-sm text-muted-foreground">{t("pos_permission")}</p>}
      {settings.connection && (
        <PosLiveSettings
          storeId={storeId}
          settings={settings}
          canEdit={canEdit}
          pending={pending}
          catalog={catalog.data}
          onSaved={receiveLive}
        />
      )}
      <section aria-label={t("pos_mapping")} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t("pos_mapping")}</h2>
          {connected && canEdit && (
            <Button
              type="button"
              variant="outline"
              disabled={!hydrated || catalog.isFetching}
              onClick={() => void catalog.refetch()}
            >
              <RefreshCw aria-hidden="true" />
              {t("pos_catalog_refresh")}
            </Button>
          )}
        </div>
        <PosCatalogStatus
          query={catalog}
          connected={connected && canEdit}
          hasProducts={settings.products.length > 0}
        />
        <PosMappingsForm
          key={settings.draft?.id ?? "published"}
          settings={settings}
          storeId={storeId}
          canEdit={canEdit}
          livePending={pending}
          catalog={catalog.data}
        />
      </section>
    </section>
  );
}

function PosLiveSettings({
  storeId,
  settings,
  canEdit,
  pending,
  catalog,
  onSaved,
}: {
  canEdit: boolean;
  catalog?: PosCatalog;
  onSaved: (next: PosSettings) => void;
  pending: boolean;
  settings: PosSettings;
  storeId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  // oxlint-disable-next-line react-doctor/no-derived-useState -- 背景更新と409では入力と基準版を保持し、保存成功か明示再読込でだけ更新する。
  const [baseline, setBaseline] = useState(settings);
  const save = useMutation({
    mutationKey: ["tablecast-pos-live", storeId],
    mutationFn: (value: ReturnType<typeof liveValues>) =>
      parseResponse(rpc.api.admin.stores[":storeId"].pos.$put({ param: { storeId }, json: value })),
    onSuccess: (next) => {
      setBaseline(next);
      form.reset(liveValues(next));
      onSaved(next);
    },
    onError: () => client.invalidateQueries({ queryKey: ["tablecast-pos-settings", storeId] }),
  });
  const editable = canEdit && settings.connection?.status === "connected" && !pending;
  const form = useAppForm({
    defaultValues: liveValues(baseline),
    onSubmit: async ({ value }) => {
      if (editable) await save.mutateAsync(value).catch(() => undefined);
    },
  });
  const locationId = useFormStore(form.store, (state) => state.values.locationId);
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t("pos_connection_settings")}
      </summary>
      <form.AppForm>
        <form.Form className="space-y-3">
          <PosSettingsConflict settings={settings} baseline={baseline} error={save.error} />
          <fieldset disabled={!editable} className="grid gap-4 @xl:grid-cols-2">
            <form.Field name="locationId">
              {(field) => (
                <PosLocationSelect
                  value={field.state.value}
                  locations={catalog?.locations ?? []}
                  onChange={(value) => {
                    field.handleChange(value);
                    form.setFieldValue("deviceId", "");
                  }}
                />
              )}
            </form.Field>
            <form.Field name="deviceId">
              {(field) => (
                <PosDevicePicker
                  storeId={storeId}
                  locationId={locationId}
                  enabled={editable}
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </fieldset>
          {canEdit && (
            <SubmitButton disabled={!editable || !catalog}>
              <Save aria-hidden="true" />
              {t("common_save")}
            </SubmitButton>
          )}
          <ActionFeedback mutation={save} successMessage={t("pos_saved")} />
        </form.Form>
      </form.AppForm>
    </details>
  );
}

type PosMappingsFormProps = {
  canEdit: boolean;
  catalog?: PosCatalog;
  livePending: boolean;
  settings: PosSettings;
  storeId: string;
};

function usePosMappingEditor({
  storeId,
  settings,
  canEdit,
  livePending,
  catalog,
}: PosMappingsFormProps) {
  const hydrated = useHydrated();
  const client = useQueryClient();
  // oxlint-disable-next-line react-doctor/no-derived-useState -- 背景更新と409では入力と基準版を保持し、保存成功か明示再読込でだけ更新する。
  const [baseline, setBaseline] = useState(settings);
  const [sourceChosen, setSourceChosen] = useState(false);
  const key = posSettingsOptions(storeId, settings.draft?.id).queryKey;
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const update = (next: PosSettings) => {
    setBaseline(next);
    form.reset(mappingValues(next));
    client.setQueryData(key, next);
    void client.invalidateQueries({ queryKey: ["tablecast-draft", storeId, next.draft?.id] });
    for (const name of [
      "tablecast-drafts",
      "tablecast-draft-choices",
      "tablecast-configuration-history",
    ])
      void client.invalidateQueries({ queryKey: [name, storeId] });
  };
  const save = useMutation({
    mutationFn: (value: ReturnType<typeof mappingValues>) => {
      if (!baseline.draft) throw new Error("DRAFT_REQUIRED");
      return parseResponse(
        rpc.api.admin.stores[":storeId"].pos.mappings.$put({
          param: { storeId },
          json: {
            ...value,
            mappings: value.mappings.filter((mapping) => mapping.externalId),
            draftId: baseline.draft.id,
            expectedVersion: baseline.draft.version,
          },
        }),
      );
    },
    onSuccess: update,
    onError: refresh,
  });
  const reload = useMutation({
    mutationFn: () =>
      client.fetchQuery({ ...posSettingsOptions(storeId, settings.draft?.id), staleTime: 0 }),
    onSuccess: (next) => {
      update(next);
      save.reset();
      setSourceChosen(false);
    },
  });
  const needsPublished = !!baseline.draft && baseline.mappingConnectionId === null;
  const published = useQuery({
    ...posSettingsOptions(storeId),
    enabled: needsPublished,
  });
  const needsChoice = needsPublished && !!published.data?.mappingConnectionId;
  const pending = save.isPending || reload.isPending || livePending;
  const editable =
    canEdit &&
    ["draft", "ready"].includes(baseline.draft?.status ?? "") &&
    settings.connection?.status === "connected" &&
    !pending;
  const blocked =
    !editable ||
    !catalog ||
    !hydrated ||
    (needsPublished && !published.isSuccess) ||
    (needsChoice && !sourceChosen);
  const form = useAppForm({
    defaultValues: mappingValues(baseline),
    onSubmit: async ({ value }) => {
      if (!blocked) await save.mutateAsync(value).catch(() => undefined);
    },
  });
  function copy(source: { connectionId: string; mappings: PosSettings["mappings"] }) {
    form.setFieldValue("connectionId", source.connectionId);
    form.setFieldValue("mappings", posMappingValues({ ...baseline, mappings: source.mappings }));
    setSourceChosen(true);
  }
  return {
    baseline,
    blocked,
    copy,
    editable,
    form,
    hydrated,
    needsChoice,
    pending,
    published,
    reload,
    save,
    sourceChosen,
  };
}

function PosMappingsForm(props: PosMappingsFormProps) {
  const { storeId, settings, canEdit, catalog } = props;
  const { t, locale } = useI18n();
  const id = useId();
  const formId = `tablecast-pos-mappings-${id}`;
  const {
    baseline,
    blocked,
    copy,
    editable,
    form,
    hydrated,
    needsChoice,
    pending,
    published,
    reload,
    save,
    sourceChosen,
  } = usePosMappingEditor(props);
  useBlocker({
    shouldBlockFn: () => editable && form.state.isDirty && !window.confirm(t("menu_leave_unsaved")),
    enableBeforeUnload: () => editable && form.state.isDirty,
  });
  useHotkey(
    "Mod+S",
    () => {
      if (!blocked) void form.handleSubmit();
    },
    { enabled: editable, ignoreInputs: false },
  );
  const mappings = useFormStore(form.store, (state) => state.values.mappings);
  const indexes = new Map(
    mappingValues(baseline).mappings.map((mapping, index) => [
      `${mapping.kind}:${mapping.localId}`,
      index,
    ]),
  );
  function renderMapping(row: PosMappingRow) {
    const index = indexes.get(`${row.kind}:${row.localId}`);
    if (index === undefined) return null;
    return (
      <form.Field name={`mappings[${index}].externalId`}>
        {(field) => (
          <PosMappingSelect
            disabled={!editable || !catalog}
            parentRequired={!!row.option && !row.parentId}
            kind={row.kind}
            name={
              row.option
                ? `${resolveLocalized(row.product.name, locale)} · ${resolveLocalized(row.name, locale)}`
                : resolveLocalized(row.name, locale)
            }
            candidates={row.candidates}
            loaded={row.loaded}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
    );
  }
  return (
    <form.AppForm>
      <form.Form id={formId} className="space-y-4">
        {baseline.draft && (
          <p className="text-sm text-muted-foreground">{t("pos_mapping_draft_note")}</p>
        )}
        <PosSettingsConflict settings={settings} baseline={baseline} error={save.error} mappings />
        <PosMappingSourceChoices
          settings={baseline}
          published={published.data}
          needsChoice={needsChoice}
          sourceChosen={sourceChosen}
          editable={editable}
          onCopy={copy}
        />
        <PosMappingTable
          products={baseline.products}
          mappings={mappings}
          catalog={catalog}
          renderMapping={renderMapping}
        />
        {baseline.draft && canEdit && (
          <>
            <ConfigurationToolbar slot="status">
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <SaveStatus dirty={dirty} pending={pending} error={save.error || reload.error} />
                )}
              </form.Subscribe>
            </ConfigurationToolbar>
            <ConfigurationToolbar>
              <SubmitButton form={formId} disabled={blocked} aria-keyshortcuts="Control+s Meta+s">
                <Save aria-hidden="true" />
                {t("common_save")}
              </SubmitButton>
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <Button
                    nativeButton={false}
                    role="link"
                    variant="outline"
                    disabled={dirty || pending || !!save.error}
                    render={
                      <Link
                        to="/admin/stores/$storeId/menu/changes/$draftId"
                        params={{ storeId, draftId: baseline.draft?.id ?? "" }}
                      />
                    }
                  >
                    {t("workflow_review")}
                  </Button>
                )}
              </form.Subscribe>
            </ConfigurationToolbar>
          </>
        )}
        <ConfirmAction
          label={t("pos_reload")}
          subject={t("pos_reload_note")}
          disabled={!hydrated || pending}
          icon={<RefreshCw aria-hidden="true" />}
          onConfirm={() => reload.mutate()}
        />
        <ActionFeedback mutation={save} successMessage={t("pos_mapping_saved")} />
        <ErrorNotice error={reload.error} />
        <ErrorNotice query={published} retrying={published.isFetching} />
      </form.Form>
    </form.AppForm>
  );
}

function PosMappingSourceChoices({
  settings,
  published,
  needsChoice,
  sourceChosen,
  editable,
  onCopy,
}: {
  editable: boolean;
  needsChoice: boolean;
  onCopy: (source: NonNullable<PosSettings["legacyMappings"]>) => void;
  published?: PosSettings;
  settings: PosSettings;
  sourceChosen: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {needsChoice && !sourceChosen && published && (
        <div className="space-y-3 rounded-lg bg-surface-subtle p-3">
          <p>{t("pos_restore_mapping_choice")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!editable}
              onClick={() =>
                onCopy({
                  connectionId: published?.mappingConnectionId ?? "",
                  mappings: published?.mappings ?? [],
                })
              }
            >
              {t("pos_restore_mapping_keep")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editable || !settings.connection}
              onClick={() => onCopy({ connectionId: settings.connection?.id ?? "", mappings: [] })}
            >
              {t("pos_restore_mapping_clear")}
            </Button>
          </div>
        </div>
      )}
      {settings.draft && settings.legacyMappings && !needsChoice && (
        <Button
          type="button"
          variant="outline"
          disabled={!editable}
          onClick={() => {
            if (settings.legacyMappings) onCopy(settings.legacyMappings);
          }}
        >
          {t("pos_mapping_legacy_import")}
        </Button>
      )}
    </>
  );
}

function PosMappingSelect({
  disabled,
  parentRequired,
  kind,
  name,
  candidates,
  loaded,
  value,
  onChange,
}: {
  candidates: PosMappingRow["candidates"];
  disabled: boolean;
  kind: "option" | "product";
  loaded: boolean;
  name: string;
  onChange: (value: string) => void;
  parentRequired: boolean;
  value: string;
}) {
  const { t, locale } = useI18n();
  const remote = candidates.find((candidate) => candidate.id === value);
  return (
    <label className="grid gap-2 text-sm">
      <span className="sr-only">
        {name} · {t(kind === "product" ? "pos_mapping_product" : "pos_mapping_option")}
      </span>
      <NativeSelect
        disabled={disabled || parentRequired}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {t(parentRequired ? "pos_mapping_parent_required" : "pos_unmapped")}
        </option>
        {value && !remote && (
          <option value={value}>
            {t(
              parentRequired
                ? "pos_mapping_parent_required"
                : loaded
                  ? "pos_missing_reference"
                  : "pos_mapping_unchecked",
            )}
          </option>
        )}
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} ·{" "}
            {candidate.price === null ? t("pos_price_variable") : money(candidate.price, locale)}
            {!candidate.available ? ` · ${t("pos_unavailable")}` : ""}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

type ConnectionMutation = {
  error: unknown;
  isPending: boolean;
  isSuccess: boolean;
  mutate: () => void;
  submittedAt: number;
};
function PosConnectionSettings({
  settings,
  canEdit,
  pending,
  connect,
  disconnect,
}: {
  canEdit: boolean;
  connect: ConnectionMutation;
  disconnect: ConnectionMutation;
  pending: boolean;
  settings: PosSettings;
}) {
  const { t } = useI18n();
  const status = settings.connection?.status ?? "disconnected";
  const statusMessages = {
    connected: "pos_connected",
    reauthorize: "pos_reauthorize",
    disconnecting: "pos_disconnecting",
    disconnected: "pos_disconnected",
  } as const;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="p-3">
          <SquareLogo />
        </span>
        <Badge
          variant={
            status === "connected" ? "success" : status === "disconnected" ? "inactive" : "warning"
          }
        >
          {t(statusMessages[status])}
        </Badge>
        {canEdit && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!settings.configured || pending || status === "disconnecting"}
              onClick={() => connect.mutate()}
            >
              <Link2 aria-hidden="true" />
              {t(status === "connected" ? "pos_reconnect" : "pos_connect")}
            </Button>
            {settings.connection && (
              <ConfirmAction
                label={t("pos_disconnect")}
                subject={t("pos_disconnect_description")}
                disabled={pending}
                icon={<Link2Off aria-hidden="true" />}
                onConfirm={() => disconnect.mutate()}
              />
            )}
          </div>
        )}
      </div>
      {!settings.configured && (
        <p className="text-sm text-muted-foreground">{t("pos_setup_required")}</p>
      )}
      {status === "disconnecting" && (
        <p className="text-sm text-muted-foreground">{t("pos_disconnect_pending_hint")}</p>
      )}
      <ActionFeedback
        mutation={connect.submittedAt > disconnect.submittedAt ? connect : disconnect}
        successMessage={t(statusMessages[status])}
      />
    </div>
  );
}

function PosSettingsConflict({
  settings,
  baseline,
  error,
  mappings = false,
}: {
  baseline: PosSettings;
  error: unknown;
  mappings?: boolean;
  settings: PosSettings;
}) {
  const { t } = useI18n();
  const conflict =
    apiError(error)?.status === 409 ||
    (mappings
      ? (settings.draft?.version ?? 0) > (baseline.draft?.version ?? 0)
      : (settings.connection?.revision ?? 0) > (baseline.connection?.revision ?? 0));
  return conflict ? (
    <p role="status" className="text-sm text-warning">
      {t("pos_conflict")}
    </p>
  ) : null;
}

function PosCatalogStatus({
  query,
  connected,
  hasProducts,
}: {
  connected: boolean;
  hasProducts: boolean;
  query: {
    data?: PosCatalog;
    error: unknown;
    isFetching: boolean;
    isPending: boolean;
    refetch: () => unknown;
  };
}) {
  const { t } = useI18n();
  return (
    <>
      <ErrorNotice query={query} retrying={query.isFetching} />
      {query.isPending && connected && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("common_loading")}
        </p>
      )}
      {query.data && <PosIssues issues={query.data.issues} />}
      {query.data?.items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("pos_catalog_empty")}</p>
      )}
      {!hasProducts && <p className="text-sm text-muted-foreground">{t("pos_products_empty")}</p>}
    </>
  );
}

function PosLocationSelect({
  value,
  locations,
  onChange,
}: {
  locations: PosCatalog["locations"];
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();
  return (
    <label className="grid gap-2 text-sm font-medium">
      {t("pos_location")}
      <NativeSelect required value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("pos_choose_location")}</option>
        {value && !locations.some((location) => location.id === value) && (
          <option value={value}>{value}</option>
        )}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
