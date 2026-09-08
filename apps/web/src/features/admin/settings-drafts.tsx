import type { ConfigDraft } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FilePenLine,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

import { parseResponse, rpc } from "../../lib/api";
import { MenuNavigation } from "../store/menu-navigation";
import { draftOptions } from "../store/menu-query";
import { useStore } from "../store/store-shell";
import { ConfigurationChanges } from "./configuration-changes";
import { ConfigurationErrors } from "./configuration-errors";

export function SettingsDrafts() {
  const { id: storeId, role } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const drafts = useQuery({
    queryKey: ["tablecast-drafts", storeId],
    queryFn: () =>
      parseResponse(rpc.api.admin.stores[":storeId"].drafts.$get({ param: { storeId } })),
  });
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
      <MenuNavigation storeId={storeId} />
      <ErrorNotice error={drafts.error || create.error} />
      {drafts.isPending ? (
        <p role="status">{t("common_loading")}</p>
      ) : (
        <DataTable
          data={drafts.data?.drafts ?? []}
          columns={columns}
          getRowId={(draft) => draft.id}
          empty={t("admin_no_drafts")}
        />
      )}
    </>
  );
}
export function DraftPage({ draftId }: { draftId: string }) {
  const { id: storeId, role } = useStore();
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(draftOptions(storeId, draftId));
  const draft = query.data;
  const [publishKey] = useState(() => crypto.randomUUID());
  const route = rpc.api.admin.stores[":storeId"].drafts[":id"];
  const param = { storeId, id: draftId };
  function saved(next: ConfigDraft) {
    client.setQueryData(draftOptions(storeId, draftId).queryKey, next);
    void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
    void client.invalidateQueries({ queryKey: ["tablecast-admin-catalog", storeId] });
  }
  const validate = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("DRAFT_REQUIRED");
      return parseResponse(
        route.validate.$post({ param, json: { expectedVersion: draft.version } }),
      );
    },
    onSuccess: saved,
  });
  const publish = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("DRAFT_REQUIRED");
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
    onSuccess: saved,
  });
  const discard = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("DRAFT_REQUIRED");
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
    draft &&
    (draft.status === "draft" || draft.status === "ready") &&
    (role === "owner" || role === "admin");
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
        {draft && <DraftStatus status={draft.status} />}
        {draft?.changes.some((change) => change.sensitive) && (
          <Badge variant="outline" className="bg-secondary text-foreground">
            <TriangleAlert className="size-4" />
            {t("admin_sensitive")}
          </Badge>
        )}
      </div>
      <MenuNavigation storeId={storeId} draftId={draftId} />
      <ErrorNotice error={query.error || validate.error || publish.error || discard.error} />
      {draft ? (
        <>
          <p className="text-base text-muted-foreground">{t("menu_change_note")}</p>
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
              <Button
                disabled={
                  busy ||
                  draft.status !== "ready" ||
                  draft.errors.length > 0 ||
                  !draft.changes.length
                }
                onClick={() => publish.mutate()}
              >
                {t("admin_publish")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p role="status">{t("common_loading")}</p>
      )}
    </>
  );
}
function DraftStatus({ status }: { status: ConfigDraft["status"] }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={
        status === "published" || status === "ready"
          ? "bg-success-soft text-success"
          : "bg-secondary text-muted-foreground"
      }
    >
      {status === "published" || status === "ready" ? (
        <Check className="size-4" />
      ) : (
        <FilePenLine className="size-4" />
      )}
      {t(`draft_${status}`)}
    </Badge>
  );
}

function settingsDraftsColumns(
  t: ReturnType<typeof useI18n>["t"],
  storeId: string,
): ColumnDef<ConfigDraft>[] {
  return [
    {
      accessorKey: "baseVersion",
      header: t("admin_published_version"),
      cell: ({ row }) => `${row.original.baseVersion} → ${row.original.baseVersion + 1}`,
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
