import {
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  MonitorSmartphone,
  ShieldOff,
  Table2,
  UserRound,
} from "lucide-react";
import type { useI18n } from "../../i18n/locale";
import type { loadDevices } from "./devices-query";
import { ConfirmAction } from "../../components/confirm-action";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { UserIdentity } from "../../components/user-identity";
import { selectionIcon } from "./devices-model";

type Device = Awaited<ReturnType<typeof loadDevices>>["devices"][number];

export function deviceColumns(
  t: ReturnType<typeof useI18n>["t"],
  pending: boolean,
  revoke: (id: string) => void,
): DataTableColumn<Device>[] {
  return [
    {
      accessorKey: "tableName",
      meta: { icon: Table2, rowHeader: true },
      header: t("collection_table_name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="size-5" />
          <span className="font-medium">{row.original.tableName}</span>
        </div>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => (row.revokedAt === null ? 0 : 1),
      enableGlobalFilter: false,
      meta: { icon: CircleCheck },
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge variant={row.original.revokedAt ? "inactive" : "success"}>
          {row.original.revokedAt ? <ShieldOff className="size-4" /> : <Check className="size-4" />}
          {t(row.original.revokedAt ? "device_revoked" : "device_active")}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      enableGlobalFilter: false,
      meta: { icon: CalendarDays },
      header: t("device_registered_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      id: "approvedBy",
      accessorFn: (row) => `${row.approvedByName ?? ""} ${row.approvedByEmail ?? ""}`,
      meta: { icon: UserRound },
      header: t("device_registered_by"),
      cell: ({ row }) => (
        <UserIdentity
          compact
          user={{
            name: row.original.approvedByName,
            email: row.original.approvedByEmail,
            image: row.original.approvedByImage,
          }}
        />
      ),
    },
    {
      id: "revokedAt",
      accessorFn: (row) => row.revokedAt ?? undefined,
      sortUndefined: "last",
      enableGlobalFilter: false,
      meta: { icon: Clock3 },
      header: t("device_revoked_at"),
      cell: ({ row }) => <DateTime value={row.original.revokedAt} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("common_actions")}</span>,
      cell: ({ row }) =>
        !row.original.revokedAt && (
          <ConfirmAction
            label={t("device_revoke")}
            subject={row.original.tableName}
            disabled={pending}
            onConfirm={() => revoke(row.original.id)}
            icon={<ShieldOff className="size-4" />}
          />
        ),
    },
  ];
}

export function registrationColumns(
  t: ReturnType<typeof useI18n>["t"],
  tableId: string | undefined,
  onSelect: (tableId: string) => void,
): DataTableColumn<{ id: string; name: string }>[] {
  return [
    {
      accessorKey: "name",
      header: t("collection_table_name"),
      meta: { icon: Table2, rowHeader: true },
    },
    {
      id: "selection",
      header: t("admin_pair_table"),
      cell: ({ row }) => (
        <Button
          variant={tableId === row.original.id ? "default" : "outline"}
          className="min-w-28"
          aria-pressed={tableId === row.original.id}
          type="button"
          onClick={() => onSelect(row.original.id)}
        >
          <Check className={selectionIcon({ selected: tableId === row.original.id })} />
          {t(tableId === row.original.id ? "common_selected" : "common_select")}
        </Button>
      ),
    },
  ];
}
