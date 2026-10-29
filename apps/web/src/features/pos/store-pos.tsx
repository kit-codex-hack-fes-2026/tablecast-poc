import type { PosCatalog, PosSettings } from "@tablecast/api/schema";
import { useStore as useFormStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { Link2, Link2Off, RefreshCw, Save } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { SubmitButton } from "../../components/form/fields";
import { MenuOptionImage } from "../../components/menu-option-image";
import { Money } from "../../components/money";
import { PageHeader } from "../../components/page-header";
import { ProductCard } from "../../components/product-card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { useStore } from "../store/store-context";
import { PosDevicePicker } from "./pos-devices";
import { PosIssues } from "./pos-issues";
import { posCatalogOptions, posSettingsOptions } from "./pos-query";

const formValues = (settings: PosSettings) => {
  const mappings = new Map(
    settings.mappings.map((mapping) => [`${mapping.kind}:${mapping.localId}`, mapping.externalId]),
  );
  return {
    expectedRevision: settings.connection?.revision ?? 0,
    locationId: settings.connection?.locationId ?? "",
    deviceId: settings.connection?.deviceId ?? "",
    mappings: settings.products.flatMap((product) => [
      {
        kind: "product" as const,
        localId: product.id,
        externalId: mappings.get(`product:${product.id}`) ?? "",
      },
      ...product.options.map((option) => ({
        kind: "option" as const,
        localId: option.id,
        externalId: mappings.get(`option:${option.id}`) ?? "",
      })),
    ]),
  };
};

export function StorePos() {
  const store = useStore();
  const query = useSuspenseQuery(posSettingsOptions(store.id));
  return (
    <>
      <ErrorNotice query={query} retrying={query.isFetching} />
      <StorePosSettings
        key={query.data.connection?.id ?? "disconnected"}
        storeId={store.id}
        settings={query.data}
        canEdit={store.role === "owner" || store.role === "admin"}
      />
    </>
  );
}

export function StorePosSettings({
  storeId,
  settings,
  canEdit,
}: {
  canEdit: boolean;
  settings: PosSettings;
  storeId: string;
}) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const client = useQueryClient();
  const endpoint = rpc.api.admin.stores[":storeId"].pos;
  // oxlint-disable-next-line react-doctor/no-derived-useState -- 保存失敗と背景更新では入力を保持し、保存成功か明示再読込だけで基準版を更新する。
  const [defaults, setDefaults] = useState(settings);
  const refreshSettings = () =>
    client.invalidateQueries({ queryKey: posSettingsOptions(storeId).queryKey });
  const connected = settings.connection?.status === "connected";
  const update = (next: PosSettings) => {
    setDefaults(next);
    form.reset(formValues(next));
    client.setQueryData(posSettingsOptions(storeId).queryKey, next);
  };
  const save = useMutation({
    mutationFn: (value: ReturnType<typeof formValues>) =>
      parseResponse(
        endpoint.$put({
          param: { storeId },
          json: { ...value, mappings: value.mappings.filter((mapping) => mapping.externalId) },
        }),
      ),
    onSuccess: update,
    onError: refreshSettings,
  });
  const connect = useMutation({
    mutationFn: () => parseResponse(endpoint.oauth.$post({ param: { storeId } })),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: refreshSettings,
  });
  const disconnect = useMutation({
    mutationFn: () => parseResponse(endpoint.$delete({ param: { storeId } })),
    onSuccess: update,
    onError: refreshSettings,
  });
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- fetchQueryが同じ設定cacheを更新する。
  const reload = useMutation({
    mutationFn: () => client.fetchQuery({ ...posSettingsOptions(storeId), staleTime: 0 }),
    onSuccess: (next) => {
      update(next);
      save.reset();
    },
  });
  const pending = save.isPending || connect.isPending || disconnect.isPending || reload.isPending;
  const form = useAppForm({
    defaultValues: formValues(defaults),
    onSubmit: async ({ value }) => {
      if (!canEdit || pending || !connected) return;
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  const locationId = useFormStore(form.store, (state) => state.values.locationId);
  const catalog = useQuery({
    ...posCatalogOptions(storeId, locationId),
    enabled: canEdit && connected,
  });
  const editable = canEdit && connected && !pending;
  const mappingIndexes = new Map(
    formValues(defaults).mappings.map((mapping, index) => [
      `${mapping.kind}:${mapping.localId}`,
      index,
    ]),
  );
  function renderMapping(kind: "option" | "product", id: string, name: string) {
    const index = mappingIndexes.get(`${kind}:${id}`);
    if (index === undefined) return null;
    return (
      <form.Field name={`mappings[${index}].externalId`}>
        {(field) => (
          <PosMappingSelect
            kind={kind}
            name={name}
            items={catalog.data?.items ?? []}
            loaded={!!catalog.data}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
    );
  }
  return (
    <section className="@container space-y-6">
      <PageHeader title={t("pos_title")} icon={<Link2 />} />
      <PosConnectionSettings
        settings={settings}
        canEdit={canEdit}
        pending={pending || !hydrated}
        connect={connect}
        disconnect={disconnect}
      />
      {!canEdit && <p className="text-sm text-muted-foreground">{t("pos_permission")}</p>}
      <form.AppForm>
        <form.Form className="space-y-6">
          <PosSettingsConflict settings={settings} baseline={defaults} error={save.error} />
          {settings.connection && (
            <fieldset disabled={!editable} className="grid gap-4 @xl:grid-cols-2">
              <form.Field name="locationId">
                {(field) => (
                  <PosLocationSelect
                    value={field.state.value}
                    locations={catalog.data?.locations ?? []}
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
              hasProducts={defaults.products.length > 0}
            />
            <fieldset disabled={!editable || !catalog.data}>
              <PosProductMappings products={defaults.products} renderMapping={renderMapping} />
            </fieldset>
          </section>
          <PosSettingsActions
            canEdit={canEdit}
            editable={editable}
            pending={pending}
            hasCatalog={!!catalog.data}
            onReload={() => reload.mutate()}
          />
          <ActionFeedback mutation={save} successMessage={t("pos_saved")} />
          <ErrorNotice error={reload.error} />
        </form.Form>
      </form.AppForm>
    </section>
  );
}

function PosProductMappings({
  products,
  renderMapping,
}: {
  products: PosSettings["products"];
  renderMapping: (kind: "option" | "product", id: string, name: string) => ReactNode;
}) {
  const { locale } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          name={product.name[locale]}
          price={product.price}
          available={product.available}
          imageKey={product.imageKey}
          imageKind={product.imageKind}
        >
          {renderMapping("product", product.id, product.name[locale])}
          {product.options.map((option) => (
            <div key={option.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <MenuOptionImage imageKey={option.imageKey} imageKind={option.imageKind} compact />
                <span className="min-w-0 flex-1 text-sm">{option.name[locale]}</span>
                <span className="text-sm">
                  <Money signed value={option.price} />
                </span>
              </div>
              {renderMapping("option", option.id, option.name[locale])}
            </div>
          ))}
        </ProductCard>
      ))}
    </div>
  );
}

function PosMappingSelect({
  kind,
  name,
  items,
  loaded,
  value,
  onChange,
}: {
  items: PosCatalog["items"];
  kind: "option" | "product";
  loaded: boolean;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t, locale } = useI18n();
  const candidates =
    kind === "product"
      ? items
      : items.flatMap((product) =>
          product.options.map((option) => ({
            ...option,
            name: `${product.name} · ${option.name}`,
          })),
        );
  const remote = candidates.find((candidate) => candidate.id === value);
  return (
    <label className="grid gap-2 text-sm">
      <span className="sr-only">
        {name} · {t(kind === "product" ? "pos_mapping_product" : "pos_mapping_option")}
      </span>
      <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("pos_unmapped")}</option>
        {value && !remote && (
          <option value={value}>{loaded ? t("pos_missing_reference") : value}</option>
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
        <span className="font-semibold">Square</span>
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
}: {
  baseline: PosSettings;
  error: unknown;
  settings: PosSettings;
}) {
  const { t } = useI18n();
  const conflict =
    apiError(error)?.status === 409 ||
    (settings.connection?.revision ?? 0) > (baseline.connection?.revision ?? 0);
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

function PosSettingsActions({
  canEdit,
  editable,
  pending,
  hasCatalog,
  onReload,
}: {
  canEdit: boolean;
  editable: boolean;
  hasCatalog: boolean;
  onReload: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canEdit && (
        <SubmitButton disabled={!editable || !hasCatalog}>
          <Save aria-hidden="true" />
          {t("common_save")}
        </SubmitButton>
      )}
      <ConfirmAction
        label={t("pos_reload")}
        subject={t("pos_reload_note")}
        disabled={!hydrated || pending}
        icon={<RefreshCw aria-hidden="true" />}
        onConfirm={onReload}
      />
    </div>
  );
}
