import type { Demo, DemoUpdate } from "@tablecast/api/schema";
import { configurationIssueSchema } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eraser, FlaskConical, LayoutDashboard, MessagesSquare, Ticket, Users } from "lucide-react";
import { useState } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { catalogOptions } from "../catalog/catalog-query";
import { ConfigurationErrors } from "../configuration/configuration-errors";
import { draftsOptions } from "../configuration/drafts-query";
import { storesOptions } from "../store/store-query";
import { demoConfigurationState } from "./demo-configuration-model";
import { DemoConfigurationSelect, DemoSelect } from "./demo-configuration-select";
import { type DemoDevice } from "./demo-device-model";
import { DemoDisplayControls, DemoReloadButton } from "./demo-display-controls";
import { DemoPending } from "./demo-pending";
import { demoOptions } from "./demo-query";
import { DemoViewport } from "./demo-viewport";

export type DemoDisplay = { device?: DemoDevice; portrait?: boolean };

export function DemoSession({
  storeId,
  demoId,
  device = "ipad",
  portrait = false,
}: DemoDisplay & { demoId: string; storeId: string }) {
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
      <DemoPending
        device={device}
        portrait={portrait}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const pending = update.isPending || reset.isPending;
  const sourceError = data.sourceDraftId ? drafts.error : published.error;
  const { hasUpdate, draftItems, selectedConfiguration } = demoConfigurationState(
    data,
    drafts.data?.drafts,
    published.data?.version,
    sourceError,
    update.variables?.sourceDraftId,
  );
  const errors = configurationIssueSchema.array().safeParse(apiError(update.error)?.details);
  return (
    <main
      data-page-motion
      className="flex h-dvh flex-col bg-background [view-transition-name:tablecast-page]"
    >
      <header className="z-10 max-h-96 shrink-0 overflow-y-auto border-b border-border bg-card">
        <div
          className="flex h-16 items-center gap-2 overflow-x-auto p-2"
          data-testid="demo-toolbar"
        >
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
          <DemoDisplayControls device={device} portrait={portrait} onChange={setDisplay} />
          <span className="h-6 shrink-0 border-l border-border" />
          <DemoConfigurationSelect
            data={data}
            draftItems={draftItems}
            pending={pending || drafts.isPending}
            onChange={(value) =>
              update.mutate({ sourceDraftId: value === "published" ? null : value })
            }
          />
          <DemoReloadButton
            available={hasUpdate}
            pending={pending}
            onReload={() => update.mutate({ reload: true })}
          />
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
