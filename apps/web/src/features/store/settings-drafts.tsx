import { useCollectionSearch } from "../shell/collection-search";
import { ConfigurationToolbar } from "../shell/configuration-toolbar";
import type { ConfigDraft } from "@tablecast/api/schema";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock3,
  GitBranch,
  ListFilter,
  CircleCheck,
  LoaderCircle,
  type LucideIcon,
  FilePenLine,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  TriangleAlert,
  X,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { draftsOptions } from "./store-query";

import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { m } from "../../paraglide/messages";
import { DraftStatus } from "../shell/configuration-status";
import { menuLabels, menuSectionSchema, type MenuReviewSearch } from "./menu-model";
import { catalogOptions, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";
import { ConfigurationChanges } from "./configuration-changes";
import { ConfigurationErrors } from "./configuration-errors";

export function SettingsDrafts() {
  const collection = useCollectionSearch({
    sortIds: ["version", "baseVersion", "status", "changes", "createdAt", "updatedAt"],
  });
  const { id: storeId, role } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const drafts = useSuspenseQuery(draftsOptions(storeId));
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.admin.stores[":storeId"].drafts.$post({ param: { storeId } })),
    onSuccess: (draft) => {
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
        params: { storeId, draftId: draft.id, section: "products" },
      });
    },
  });
  const columns = useMemo(() => settingsDraftsColumns(t, storeId), [t, storeId]);
  return (
    <>
      <PageHeader
        title={t("admin_drafts")}
        actions={
          (role === "owner" || role === "admin") && (
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              <Plus />
              {t("editor_create_draft")}
            </Button>
          )
        }
      />

      <ErrorNotice error={drafts.error || create.error} onRetry={() => void drafts.refetch()} />
      <DataTable
        {...collection}
        data={drafts.data.drafts}
        columns={columns}
        getRowId={(draft) => draft.id}
        empty={t("admin_no_drafts")}
        tableLabel={t("admin_drafts")}
        searchLabel={t("collection_search_drafts")}
        searchPlaceholder={t("collection_search_drafts_placeholder")}
      />
      <p className="mt-2 text-xs text-muted-foreground">{t("collection_loaded_scope")}</p>
    </>
  );
}
export function DraftPage({ draftId, search }: { draftId: string; search: MenuReviewSearch }) {
  const { returnSection = "products", ...listSearch } = search;
  const { id: storeId, role } = useStore();
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useSuspenseQuery(draftOptions(storeId, draftId));
  const draft = query.data;
  const store = useStore();
  const catalog = useSuspenseQuery(catalogOptions(storeId));
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishKey] = useState(() => crypto.randomUUID());
  const route = rpc.api.admin.stores[":storeId"].drafts[":id"];
  const param = { storeId, id: draftId };
  function saved(next: ConfigDraft) {
    client.setQueryData(draftOptions(storeId, draftId).queryKey, next);
    void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-configuration-history", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-configuration-release", storeId] });
  }
  const validate = useMutation({
    mutationFn: () => {
      return parseResponse(
        route.validate.$post({ param, json: { expectedVersion: draft.version } }),
      );
    },
    onSuccess: saved,
  });
  const publish = useMutation({
    mutationFn: () => {
      return parseResponse(
        route.publish.$post({
          param,
          json: {
            expectedVersion: draft.version,
            baseVersion: draft.baseVersion,
            idempotencyKey: publishKey,
            approved: true,
          },
        }),
      );
    },
    onSuccess: (next) => {
      saved(next);
      void client.invalidateQueries({ queryKey: ["tablecast-admin-catalog", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-stores"] });
      setConfirmPublish(false);
    },
    onError: async (error) => {
      if (apiError(error)?.status !== 409) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: catalogOptions(storeId).queryKey }),
        client.invalidateQueries({ queryKey: draftOptions(storeId, draftId).queryKey }),
      ]);
      setConfirmPublish(false);
    },
  });
  const discard = useMutation({
    mutationFn: () => {
      return parseResponse(
        route.discard.$post({ param, json: { expectedVersion: draft.version } }),
      );
    },
    onSuccess: (next) => {
      saved(next);
      void navigate({ to: "/admin/stores/$storeId/menu/changes", params: { storeId } });
    },
  });
  const busy = [validate.isPending, publish.isPending, discard.isPending].some(Boolean);
  const { editable, stale, cannotPublish, guidance } = draftPublicationState(
    draft,
    role,
    catalog.data.version,
  );
  const error = validate.error || publish.error || discard.error;

  return (
    <>
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        className="w-fit"
        render={<Link to="/admin/stores/$storeId/menu/changes" params={{ storeId }} />}
      >
        <ArrowLeft />
        {t("admin_drafts")}
      </Button>
      <PageHeader title={t("admin_review_draft")} />

      <ErrorNotice error={query.error || catalog.error || error} />
      <div className="space-y-2">
        <p
          role="status"
          className={stale || draft.errors.length ? "text-destructive" : "text-muted-foreground"}
        >
          <span key={guidance} className="block motion-safe:animate-tablecast-state">
            {editable ? t(guidance) : t("workflow_terminal_note")}
          </span>
        </p>
        {draft.changes.some((change) => change.sensitive) && (
          <Badge variant="warning">
            <TriangleAlert />
            {t("admin_sensitive")}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2" aria-label={t("workflow_correction_links")}>
        {menuSectionSchema.options.map((section) => (
          <Button
            key={section}
            nativeButton={false}
            role="link"
            variant="outline"
            render={
              editable ? (
                <Link
                  to="/admin/stores/$storeId/menu/changes/$draftId/$section"
                  params={{ storeId, draftId, section }}
                  search={section === returnSection ? listSearch : {}}
                />
              ) : (
                <Link
                  to="/admin/stores/$storeId/menu/$section"
                  params={{ storeId, section }}
                  search={section === returnSection ? listSearch : {}}
                />
              )
            }
          >
            {t(menuLabels[section])}
          </Button>
        ))}
      </div>
      {(!editable || stale) && (
        <Button
          nativeButton={false}
          role="link"
          render={
            <Link
              to="/admin/stores/$storeId/menu/$section"
              params={{ storeId, section: returnSection }}
              search={listSearch}
            />
          }
        >
          {t("workflow_view_published")}
        </Button>
      )}

      <ConfigurationErrors errors={draft.errors} configuration={draft.configuration} />
      <ConfigurationChanges changes={draft.changes} configuration={draft.configuration} />
      {editable && (
        <ConfigurationToolbar>
          <div className="flex flex-wrap gap-2">
            <ConfirmAction
              label={t("editor_discard_draft")}
              triggerLabel={t("workflow_discard_short")}
              subject={t("menu_discard_note")}
              disabled={busy}
              onConfirm={() => discard.mutate()}
              icon={<Trash2 />}
            />
            <Button
              variant="outline"
              aria-label={t("admin_validate")}
              disabled={busy || !draft.changes.length}
              onClick={() => validate.mutate()}
            >
              <PublicationIcon pending={validate.isPending} icon={Check} />
              {t("workflow_validate_short")}
            </Button>
            <Button
              aria-label={t("admin_publish")}
              disabled={busy || cannotPublish}
              onClick={() => setConfirmPublish(true)}
            >
              <PublicationIcon pending={publish.isPending} icon={Upload} />
              {t("workflow_publish_short")}
            </Button>
          </div>
        </ConfigurationToolbar>
      )}
      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workflow_publish_title")}</DialogTitle>
            <DialogClose aria-label={t("common_close")}>
              <X />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            {m.workflow_publish_impact(
              { store: store.name, version: draft.baseVersion + 1 },
              { locale },
            )}
          </DialogDescription>
          <DialogScroll>
            <ConfigurationChanges changes={draft.changes} configuration={draft.configuration} />
            <ErrorNotice error={publish.error} />
          </DialogScroll>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)}>
              {t("common_cancel")}
            </Button>
            <Button
              disabled={busy || cannotPublish}
              data-pwa-blocked={busy}
              onClick={() => publish.mutate()}
            >
              <PublicationIcon pending={publish.isPending} icon={Upload} />
              {t("admin_publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function PublicationIcon({ pending, icon: Icon }: { pending: boolean; icon: LucideIcon }) {
  return pending ? <LoaderCircle className="motion-safe:animate-spin" /> : <Icon />;
}

function settingsDraftsColumns(
  t: ReturnType<typeof useI18n>["t"],
  storeId: string,
): DataTableColumn<ConfigDraft>[] {
  return [
    {
      id: "identity",
      enableSorting: false,
      enableGlobalFilter: false,
      meta: { rowHeader: true },
      header: t("workflow_draft_identity"),
      cell: ({ row }) => (
        <Link
          className="inline-flex min-h-11 max-w-72 items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4 whitespace-normal"
          to="/admin/stores/$storeId/menu/changes/$draftId"
          params={{ storeId, draftId: row.original.id }}
        >
          <FilePenLine aria-hidden="true" className="size-5 shrink-0" />
          <DateTime value={row.original.createdAt} />
        </Link>
      ),
    },
    {
      accessorKey: "version",
      header: t("admin_draft_version"),
      meta: { icon: FilePenLine, align: "right" },
    },
    {
      accessorKey: "baseVersion",
      meta: { icon: GitBranch, align: "right" },
      header: t("admin_published_version"),
      cell: ({ row }) => row.original.baseVersion,
    },
    {
      id: "status",
      accessorFn: (row) => t(row.status === "draft" ? "workflow_saved" : `draft_${row.status}`),
      meta: { icon: CircleCheck },
      header: t("common_status"),
      cell: ({ row }) => <DraftStatus status={row.original.status} />,
    },
    {
      id: "changes",
      header: t("admin_change_count"),
      accessorFn: (row) => row.changes.length,
      meta: { icon: ListFilter, align: "right" },
      enableGlobalFilter: false,
    },
    {
      accessorKey: "createdAt",
      enableGlobalFilter: false,
      meta: { icon: CalendarDays },
      header: t("common_created_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      accessorKey: "updatedAt",
      enableGlobalFilter: false,
      meta: { icon: Clock3 },
      header: t("common_updated_at"),
      cell: ({ row }) => <DateTime value={row.original.updatedAt} />,
    },
  ];
}

function draftPublicationState(draft: ConfigDraft, role: string, publishedVersion: number) {
  const editable =
    (draft.status === "draft" || draft.status === "ready") &&
    (role === "owner" || role === "admin");
  const stale = editable && publishedVersion !== draft.baseVersion;
  const cannotPublish =
    !editable ||
    stale ||
    draft.status !== "ready" ||
    draft.errors.length > 0 ||
    !draft.changes.length;
  const guidance = stale
    ? "workflow_stale"
    : draft.errors.length
      ? "workflow_fix_errors"
      : !draft.changes.length
        ? "workflow_no_changes"
        : draft.status !== "ready"
          ? "workflow_validate_first"
          : "workflow_publish_ready";
  return { editable, stale, cannotPublish, guidance } as const;
}
