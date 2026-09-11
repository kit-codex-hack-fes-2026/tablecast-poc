import type { Demo, DemoUpdate } from "@tablecast/api/schema";
import { configurationIssueSchema } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw, RotateCcw } from "lucide-react";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";
import { ApiFailure, parseResponse, rpc } from "../../lib/api";
import { ConfigurationErrors } from "./configuration-errors";
import { demoOptions } from "./demo-query";
import { DemoViewport } from "./demo-viewport";
import { draftsOptions, storesOptions } from "./store-query";

type DemoDisplay = { tablet?: boolean; portrait?: boolean };

export function DemoPage({
  storeId,
  demoId,
  tablet,
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
        search: { demoId: demo.id, tablet, portrait },
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
    return <DemoSession storeId={storeId} demoId={demoId} tablet={tablet} portrait={portrait} />;
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
  tablet = false,
  portrait = false,
}: { storeId: string; demoId: string } & DemoDisplay) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(demoOptions(storeId, demoId));
  const drafts = useQuery(draftsOptions(storeId));
  const stores = useQuery(storesOptions);
  const [planRemoved, setPlanRemoved] = useState(false);
  const setDisplay = (nextTablet: boolean, nextPortrait: boolean) => {
    void navigate({
      to: "/admin/stores/$storeId/demo",
      params: { storeId },
      search: { demoId, tablet: nextTablet, portrait: nextPortrait },
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
    onSettled: () => {
      void query.refetch();
    },
  });
  const reset = useMutation({
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
    onSettled: () => {
      void query.refetch();
    },
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
  const draftItems =
    drafts.data?.drafts.filter((draft) => draft.status === "draft" || draft.status === "ready") ??
    [];
  const errors = configurationIssueSchema
    .array()
    .safeParse(update.error instanceof ApiFailure ? update.error.details : undefined);
  const selectedConfiguration =
    draftItems.find((draft) => draft.id === update.variables?.sourceDraftId)?.configuration ??
    data.configuration;
  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="z-10 max-h-96 shrink-0 overflow-auto border-b border-border bg-background p-3">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="font-semibold">{t("demo_title")}</h1>
          <span className="text-sm text-muted-foreground">
            {stores.data?.stores.find((store) => store.id === storeId)?.name}
          </span>
          <span className="text-sm text-muted-foreground">{t("demo_isolated")}</span>
          <Link
            className="ml-auto text-sm underline"
            to="/admin/stores/$storeId/floor"
            params={{ storeId }}
          >
            {t("admin_live")}
          </Link>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <DemoSelect
            label={t("demo_display")}
            value={tablet ? "tablet" : "browser"}
            items={[
              { value: "browser", label: t("demo_browser") },
              { value: "tablet", label: "iPad Air 11″" },
            ]}
            onChange={(value) => setDisplay(value === "tablet", portrait)}
          />
          {tablet && (
            <DemoSelect
              label={t("demo_orientation")}
              value={portrait ? "portrait" : "landscape"}
              items={[
                { value: "landscape", label: t("demo_landscape") },
                { value: "portrait", label: t("demo_portrait") },
              ]}
              onChange={(value) => setDisplay(tablet, value === "portrait")}
            />
          )}
          <DemoSelect
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
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              void drafts.refetch();
              update.mutate({ reload: true });
            }}
          >
            <RefreshCw />
            {t("demo_reload")}
          </Button>
          <DemoSelect
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
            label={t("demo_guests")}
            value={String(data.guestCount)}
            disabled={pending}
            items={Array.from({ length: 30 }, (_, index) => ({
              value: String(index + 1),
              label: String(index + 1),
            }))}
            onChange={(value) => update.mutate({ guestCount: Number(value) })}
          />
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <Checkbox
              checked={data.configuration.cast.proactive}
              disabled={pending}
              onCheckedChange={(proactive) => update.mutate({ proactive })}
            />
            {t("demo_proactive")}
          </label>
          <ConfirmAction
            label={t("demo_reset")}
            subject={t("demo_reset_confirm")}
            disabled={pending}
            onConfirm={() => reset.mutate()}
            icon={<RotateCcw />}
          />
        </div>
        {pending && (
          <p role="status" className="mt-2 text-sm">
            {t("demo_updating")}
          </p>
        )}
        {planRemoved && (
          <p role="status" className="mt-2 text-sm">
            {t("demo_plan_removed")}
          </p>
        )}
        <ErrorNotice error={query.error ?? update.error ?? reset.error} />
        <ErrorNotice error={drafts.error} onRetry={() => void drafts.refetch()} />
        {errors.success && (
          <ConfigurationErrors errors={errors.data} configuration={selectedConfiguration} />
        )}
      </header>
      <DemoViewport
        tablet={tablet}
        portrait={portrait}
        src={`/admin/stores/${encodeURIComponent(storeId)}/demo/${encodeURIComponent(demoId)}`}
      />
    </main>
  );
}

export function DemoSelect({
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-24 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Select
        value={value}
        items={items}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger aria-label={label} className="max-w-64 text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
