import type { Demo, DemoUpdate } from "@tablecast/api/schema";
import { configurationIssueSchema } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FlaskConical,
  LayoutDashboard,
  Monitor,
  Tablet,
  RotateCw,
  RefreshCw,
  Eraser,
  FileStack,
  Ticket,
  Users,
  MessagesSquare,
} from "lucide-react";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { ConfigurationErrors } from "./configuration-errors";
import { demoOptions } from "./demo-query";
import { DemoViewport } from "./demo-viewport";
import { type DemoDevice, demoDevices } from "./demo-device-model";
import { catalogOptions } from "./menu-query";
import { draftsOptions, storesOptions } from "./store-query";

type DemoDisplay = { device?: DemoDevice; portrait?: boolean };

export function DemoPage({
  storeId,
  demoId,
  device,
  portrait,
}: { storeId: string; demoId?: string } & DemoDisplay) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const started = useRef(false);
  const create = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.admin.stores[":storeId"].demo.$post({ param: { storeId } })),
    onSuccess: async (demo) => {
      client.setQueryData(demoOptions(storeId, demo.id).queryKey, demo);
      await navigate({
        to: "/admin/stores/$storeId/demo",
        params: { storeId },
        search: { demoId: demo.id, device, portrait },
        replace: true,
      });
    },
  });
  const { mutate } = create;
  useEffect(() => {
    if (!demoId && !started.current) {
      started.current = true;
      mutate();
    }
  }, [demoId, mutate]);
  if (demoId)
    return <DemoSession storeId={storeId} demoId={demoId} device={device} portrait={portrait} />;
  return (
    <main className="p-6">
      <h1>{t("demo_title")}</h1>
      {create.isError ? (
        <ErrorNotice error={create.error} onRetry={() => create.mutate()} />
      ) : (
        <LoadingState />
      )}
    </main>
  );
}

function DemoSession({
  storeId,
  demoId,
  device = "ipad",
  portrait = false,
}: { storeId: string; demoId: string } & DemoDisplay) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(demoOptions(storeId, demoId));
  const drafts = useQuery({ ...draftsOptions(storeId), refetchInterval: 5000 });
  const published = useQuery({
    ...catalogOptions(storeId),
    enabled: query.data?.sourceDraftId === null,
    refetchInterval: 5000,
  });
  const stores = useQuery(storesOptions);
  const [planRemoved, setPlanRemoved] = useState(false);
  const setDisplay = (nextDevice: DemoDevice, nextPortrait: boolean) => {
    void navigate({
      to: "/admin/stores/$storeId/demo",
      params: { storeId },
      search: { demoId, device: nextDevice, portrait: nextPortrait },
      replace: true,
    });
  };
  const param = { storeId, demoId };
  const receive = (demo: Demo) => {
    setPlanRemoved(
      Boolean(
        query.data?.planId &&
        !demo.planId &&
        !demo.configuration.plans.some((plan) => plan.id === query.data?.planId),
      ),
    );
    client.setQueryData(demoOptions(storeId, demoId).queryKey, demo);
  };
  const update = useMutation({
    onMutate: () => client.cancelQueries({ queryKey: demoOptions(storeId, demoId).queryKey }),
    mutationFn: (input: Omit<DemoUpdate, "expectedVersion">) => {
      if (!query.data) throw new Error("DEMO_REQUIRED");
      return parseResponse(
        rpc.api.admin.stores[":storeId"].demo[":demoId"].$patch({
          param,
          json: { ...input, expectedVersion: query.data.version },
        }),
      );
    },
    onSuccess: receive,
    onSettled: () => query.refetch(),
  });
  const reset = useMutation({
    onMutate: () => client.cancelQueries({ queryKey: demoOptions(storeId, demoId).queryKey }),
    mutationFn: () => {
      if (!query.data) throw new Error("DEMO_REQUIRED");
      return parseResponse(
        rpc.api.admin.stores[":storeId"].demo[":demoId"].reset.$post({
          param,
          json: { expectedVersion: query.data.version, approved: true },
        }),
      );
    },
    onSuccess: receive,
    onSettled: () => query.refetch(),
  });
  const data = query.data;
  if (!data)
    return (
      <main className="p-6">
        {query.isPending ? (
          <LoadingState />
        ) : (
          <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
        )}
      </main>
    );
  const pending = update.isPending || reset.isPending;
  const sourceVersion = data.sourceDraftId
    ? drafts.data?.drafts.find((draft) => draft.id === data.sourceDraftId)?.version
    : published.data?.version;
  const sourceError = data.sourceDraftId ? drafts.error : published.error;
  const hasUpdate =
    !sourceError && sourceVersion !== undefined && sourceVersion > data.sourceVersion;
  const draftItems =
    drafts.data?.drafts.filter((draft) => draft.status === "draft" || draft.status === "ready") ??
    [];
  const errors = configurationIssueSchema.array().safeParse(apiError(update.error)?.details);
  const selectedConfiguration =
    draftItems.find((draft) => draft.id === update.variables?.sourceDraftId)?.configuration ??
    data.configuration;
  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="z-10 max-h-96 shrink-0 overflow-y-auto border-b border-border bg-card">
        <div className="flex items-center gap-2 overflow-x-auto p-2" data-testid="demo-toolbar">
          <div
            className="flex shrink-0 items-center gap-2 px-2 text-primary"
            title={t("demo_isolated")}
          >
            <FlaskConical className="size-5" aria-hidden="true" />
            <h1 className="sr-only xl:not-sr-only xl:text-sm xl:font-semibold">
              {t("demo_title")}
            </h1>
            <span className="sr-only">{t("demo_isolated")}</span>
          </div>
          <DemoSelect
            icon={device === "browser" ? <Monitor /> : <Tablet />}
            label={t("demo_display")}
            value={device}
            items={[
              { value: "browser", label: t("demo_browser") },
              ...Object.entries(demoDevices).map(([value, item]) => ({ value, label: item.label })),
            ]}
            onChange={(value) => {
              if (
                value === "browser" ||
                value === "ipad" ||
                value === "ipad-air-11" ||
                value === "ipad-air-13"
              )
                setDisplay(value, portrait);
            }}
          />
          <Button
            variant="ghost"
            className="flex-col gap-1 px-2 text-xs"
            aria-label={t("demo_rotate")}
            aria-pressed={portrait}
            title={portrait ? t("demo_landscape") : t("demo_portrait")}
            disabled={device === "browser"}
            onClick={() => setDisplay(device, !portrait)}
          >
            <RotateCw />
            {t("demo_rotate")}
          </Button>
          <span className="h-6 shrink-0 border-l border-border" />
          <DemoSelect
            icon={<FileStack />}
            label={t("demo_configuration")}
            value={data.sourceDraftId ?? "published"}
            disabled={pending || drafts.isPending}
            items={[
              { value: "published", label: t("demo_published") },
              ...draftItems.map((draft) => ({
                value: draft.id,
                label: `${t("demo_draft")} ${draft.id.slice(0, 8)} · v${draft.id === data.sourceDraftId ? data.sourceVersion : draft.version}`,
              })),
              ...(data.sourceDraftId && !draftItems.some((draft) => draft.id === data.sourceDraftId)
                ? [
                    {
                      value: data.sourceDraftId,
                      label: `${t("demo_draft")} ${data.sourceDraftId.slice(0, 8)}`,
                    },
                  ]
                : []),
            ]}
            onChange={(value) =>
              update.mutate({ sourceDraftId: value === "published" ? null : value })
            }
          />
          <span title={hasUpdate ? t("demo_update_available") : t("demo_up_to_date")}>
            <Button
              variant={hasUpdate ? "default" : "ghost"}
              className="flex-col gap-1 px-2 text-xs"
              aria-label={t("demo_reload")}
              disabled={pending || !hasUpdate}
              onClick={() => update.mutate({ reload: true })}
            >
              <RefreshCw />
              {t("demo_reload")}
            </Button>
            <span role="status" className="sr-only">
              {hasUpdate ? t("demo_update_available") : ""}
            </span>
          </span>
          <span className="h-6 shrink-0 border-l border-border" />
          <DemoSelect
            icon={<Ticket />}
            label={t("demo_plan")}
            value={data.planId ?? "none"}
            disabled={pending}
            items={[
              { value: "none", label: t("demo_no_plan") },
              ...data.configuration.plans.map((plan) => ({
                value: plan.id,
                label: plan.text[locale].displayName,
              })),
            ]}
            onChange={(value) => update.mutate({ planId: value === "none" ? null : value })}
          />
          <DemoSelect
            icon={<Users />}
            label={t("demo_guests")}
            value={String(data.guestCount)}
            disabled={pending}
            items={Array.from({ length: 30 }, (_, index) => ({
              value: String(index + 1),
              label: String(index + 1),
            }))}
            onChange={(value) => update.mutate({ guestCount: Number(value) })}
          />
          <Button
            variant={data.configuration.cast.proactive ? "secondary" : "ghost"}
            className="flex-col gap-1 px-2 text-xs"
            title={t("demo_proactive")}
            aria-label={t("demo_proactive")}
            aria-pressed={data.configuration.cast.proactive}
            disabled={pending}
            onClick={() => update.mutate({ proactive: !data.configuration.cast.proactive })}
          >
            <MessagesSquare />
            {t("demo_proactive")}
          </Button>
          <span className="ml-auto h-6 shrink-0 border-l border-border" />
          <ConfirmAction
            triggerClassName="flex-col gap-1 px-2 text-xs"
            label={t("demo_reset")}
            subject={t("demo_reset_confirm")}
            disabled={pending}
            onConfirm={() => reset.mutate()}
            icon={<Eraser />}
          />
          <Link
            className="flex h-12 shrink-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("admin_live")}
            title={`${stores.data?.stores.find((store) => store.id === storeId)?.name ?? ""} · ${t("admin_live")}`}
            to="/admin/stores/$storeId/floor"
            params={{ storeId }}
          >
            <LayoutDashboard className="size-4" />
            {t("admin_live")}
          </Link>
        </div>
        {pending && (
          <p role="status" className="px-4 pb-2 text-sm">
            {t("demo_updating")}
          </p>
        )}
        {planRemoved && (
          <p role="status" className="px-4 pb-2 text-sm">
            {t("demo_plan_removed")}
          </p>
        )}
        <ErrorNotice error={query.error ?? update.error ?? reset.error} />
        <ErrorNotice error={published.error} onRetry={() => void published.refetch()} />
        <ErrorNotice error={drafts.error} onRetry={() => void drafts.refetch()} />
        {errors.success && (
          <ConfigurationErrors errors={errors.data} configuration={selectedConfiguration} />
        )}
      </header>
      <DemoViewport
        device={device}
        portrait={portrait}
        src={`/admin/stores/${encodeURIComponent(storeId)}/demo/${encodeURIComponent(demoId)}`}
      />
    </main>
  );
}

export function DemoSelect({
  icon,
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-20 max-w-44 shrink-0" title={label}>
      <Select
        value={value}
        items={items}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger aria-label={label} className="py-1 text-sm">
          <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="text-xs text-muted-foreground">{label}</span>
            <SelectValue className="max-w-full truncate" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
