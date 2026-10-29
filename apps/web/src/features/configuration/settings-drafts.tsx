import type { ConfigDraft } from "@tablecast/api/schema";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleCheck,
  Clock3,
  FilePenLine,
  GitBranch,
  ListFilter,
  Plus,
} from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { useCollectionSearch } from "../shell/collection-search";
import { useStore } from "../store/store-context";
import { DraftStatus } from "./configuration-status";
import { draftsOptions } from "./drafts-query";
import { receiveDraft } from "./menu-query";

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
      receiveDraft(client, storeId, draft);
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
        defaultSort={{ id: "updatedAt", desc: true }}
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
