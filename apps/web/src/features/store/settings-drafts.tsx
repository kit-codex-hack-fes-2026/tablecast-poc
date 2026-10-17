import type { ConfigDraft } from "@tablecast/api/schema";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Plus,
  Trash2,
  TriangleAlert,
  X,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
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
import { ConfigurationStatus, DraftStatus } from "../shell/configuration-status";
import { menuLabels, menuSectionSchema, type MenuReviewSearch } from "./menu-model";
import { catalogOptions, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";
import { ConfigurationChanges } from "./configuration-changes";
import { ConfigurationErrors } from "./configuration-errors";

export function SettingsDrafts() {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("admin_drafts")}</h1>
        {(role === "owner" || role === "admin") && (
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            <Plus />
            {t("editor_create_draft")}
          </Button>
        )}
      </div>

      <ErrorNotice error={drafts.error || create.error} onRetry={() => void drafts.refetch()} />
      <DataTable
        data={drafts.data.drafts}
        columns={columns}
        getRowId={(draft) => draft.id}
        empty={t("admin_no_drafts")}
      />
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
  const busy = validate.isPending || publish.isPending || discard.isPending;
  const editable =
    (draft.status === "draft" || draft.status === "ready") &&
    (role === "owner" || role === "admin");
  const stale = editable && catalog.data.version !== draft.baseVersion;
  const cannotPublish =
    !editable ||
    stale ||
    draft.status !== "ready" ||
    draft.errors.length > 0 ||
    !draft.changes.length;
  const error = validate.error || publish.error || discard.error;
  const guidance = stale
    ? "workflow_stale"
    : draft.errors.length
      ? "workflow_fix_errors"
      : !draft.changes.length
        ? "workflow_no_changes"
        : draft.status !== "ready"
          ? "workflow_validate_first"
          : "workflow_publish_ready";
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
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t("admin_review_draft")}</h1>
        <DraftStatus status={draft.status} />
        {draft.changes.some((change) => change.sensitive) && (
          <Badge variant="outline" className="bg-secondary text-foreground">
            <TriangleAlert className="size-4" />
            {t("admin_sensitive")}
          </Badge>
        )}
      </div>

      <ConfigurationStatus
        storeName={store.name}
        publishedVersion={catalog.data.version}
        draft={draft}
        error={error}
      />
      <ErrorNotice error={query.error || catalog.error || error} />
      <p
        role="status"
        className={stale || draft.errors.length ? "text-destructive" : "text-muted-foreground"}
      >
        {editable ? t(guidance) : t("workflow_terminal_note")}
      </p>
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

      {editable && <p className="text-base text-muted-foreground">{t("menu_change_note")}</p>}
      <ConfigurationErrors errors={draft.errors} configuration={draft.configuration} />
      <ConfigurationChanges changes={draft.changes} configuration={draft.configuration} />
      {editable && (
        <div className="flex flex-wrap gap-3 border-t border-border pt-5">
          <ConfirmAction
            label={t("editor_discard_draft")}
            subject={t("menu_discard_note")}
            disabled={busy}
            onConfirm={() => discard.mutate()}
            icon={<Trash2 />}
          />
          <Button variant="outline" disabled={busy} onClick={() => validate.mutate()}>
            <Check />
            {t("admin_validate")}
          </Button>
          <Button disabled={busy || cannotPublish} onClick={() => setConfirmPublish(true)}>
            <Upload />
            {t("admin_publish")}
          </Button>
        </div>
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
              <Upload />
              {t("admin_publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function settingsDraftsColumns(
  t: ReturnType<typeof useI18n>["t"],
  storeId: string,
): ColumnDef<ConfigDraft>[] {
  return [
    { accessorKey: "id", header: t("editor_id"), cell: ({ row }) => row.original.id.slice(0, 8) },
    { accessorKey: "version", header: t("admin_draft_version") },
    {
      accessorKey: "baseVersion",
      header: t("admin_published_version"),
      cell: ({ row }) => row.original.baseVersion,
    },
    {
      accessorKey: "status",
      header: t("common_status"),
      cell: ({ row }) => <DraftStatus status={row.original.status} />,
    },
    { id: "changes", header: t("admin_change_count"), accessorFn: (row) => row.changes.length },
    {
      accessorKey: "createdAt",
      header: t("common_created_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      accessorKey: "updatedAt",
      header: t("common_updated_at"),
      cell: ({ row }) => <DateTime value={row.original.updatedAt} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("admin_details")}</span>,
      cell: ({ row }) => (
        <Button
          nativeButton={false}
          role="link"
          variant="ghost"
          render={
            <Link
              to="/admin/stores/$storeId/menu/changes/$draftId"
              params={{ storeId, draftId: row.original.id }}
            />
          }
        >
          {t("admin_review_draft")}
          <ArrowUpRight className="size-4" />
        </Button>
      ),
    },
  ];
}
