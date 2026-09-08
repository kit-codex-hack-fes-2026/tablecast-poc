import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Check, MonitorSmartphone, Plus, ShieldOff } from "lucide-react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";

import { parseResponse, rpc } from "../../lib/api";
import { useStore } from "./store-shell";
const loadDevices = (storeId: string) =>
  parseResponse(rpc.api.admin.stores[":storeId"].devices.$get({ param: { storeId } }));
type Device = Awaited<ReturnType<typeof loadDevices>>["devices"][number];
export function Devices() {
  const { id: storeId } = useStore();
  const { t } = useI18n();
  const client = useQueryClient();
  const devices = useQuery({
    queryKey: ["tablecast-devices", storeId],
    queryFn: () => loadDevices(storeId),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].devices[":id"].revoke.$post({ param: { storeId, id } }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-devices", storeId] }),
  });
  const columns = useMemo(
    () => deviceColumns(t, revoke.isPending, revoke.mutate),
    [t, revoke.isPending, revoke.mutate],
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("device_title")}</h1>
        <Button
          nativeButton={false}
          role="link"
          render={<Link to="/admin/stores/$storeId/devices/new" params={{ storeId }} />}
        >
          <Plus />
          {t("admin_pair")}
        </Button>
      </div>
      <ErrorNotice error={devices.error || revoke.error} />
      {devices.isPending ? (
        <p role="status">{t("common_loading")}</p>
      ) : (
        <DataTable
          data={devices.data?.devices ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          searchLabel={t("device_search")}
          empty={t("device_empty")}
        />
      )}
    </>
  );
}
export function RegisterDevice({ userCode, tableId }: { userCode: string; tableId?: string }) {
  const { id: storeId } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const devices = useQuery({
    queryKey: ["tablecast-devices", storeId],
    queryFn: () => loadDevices(storeId),
  });
  const approve = useMutation({
    mutationFn: () => {
      if (!tableId) throw new Error("TABLE_REQUIRED");
      return parseResponse(
        rpc.api.admin.stores[":storeId"].devices.approve.$post({
          param: { storeId },
          json: { userCode, tableId },
        }),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-devices", storeId] });
      void navigate({ to: "/admin/stores/$storeId/devices", params: { storeId } });
    },
  });
  const columns = useMemo(
    () => registrationColumns(t, tableId, navigate, storeId, userCode),
    [t, tableId, navigate, storeId, userCode],
  );
  return (
    <section className="space-y-6">
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={<Link to="/admin/stores/$storeId/devices" params={{ storeId }} />}
      >
        <ArrowLeft />
        {t("device_title")}
      </Button>
      <h1 className="text-2xl font-semibold">{t("admin_pair")}</h1>
      <p className="text-base text-muted-foreground">{t("device_register_note")}</p>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          approve.mutate();
        }}
      >
        <label className="flex max-w-sm flex-col gap-2 text-base">
          {t("admin_pair_code")}
          <Input
            autoComplete="off"
            required
            value={userCode}
            maxLength={30}
            onChange={(event) =>
              void navigate({
                to: "/admin/stores/$storeId/devices/new",
                params: { storeId },
                search: { user_code: event.target.value.toUpperCase(), tableId },
                replace: true,
              })
            }
          />
        </label>
        {devices.isPending ? (
          <p role="status">{t("common_loading")}</p>
        ) : (
          <DataTable
            data={devices.data?.tables ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            searchLabel={t("device_search_table")}
          />
        )}
        <ErrorNotice error={devices.error || approve.error} />
        <Button type="submit" disabled={approve.isPending || !tableId || !userCode}>
          <Check />
          {t("admin_approve")}
        </Button>
      </form>
    </section>
  );
}

function deviceColumns(
  t: ReturnType<typeof useI18n>["t"],
  pending: boolean,
  revoke: (id: string) => void,
): ColumnDef<Device>[] {
  return [
    {
      accessorKey: "tableName",
      header: t("admin_table"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="size-5" />
          <span className="font-medium">{row.original.tableName}</span>
        </div>
      ),
    },
    {
      accessorKey: "revokedAt",
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={
            row.original.revokedAt
              ? "bg-secondary text-muted-foreground"
              : "bg-success-soft text-success"
          }
        >
          {row.original.revokedAt ? <ShieldOff className="size-4" /> : <Check className="size-4" />}
          {t(row.original.revokedAt ? "device_revoked" : "device_active")}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("device_registered_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      id: "approvedBy",
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
      id: "revocation",
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

function registrationColumns(
  t: ReturnType<typeof useI18n>["t"],
  tableId: string | undefined,
  navigate: ReturnType<typeof useNavigate>,
  storeId: string,
  userCode: string,
): ColumnDef<{ id: string; name: string }>[] {
  return [
    { accessorKey: "name", header: t("admin_table") },
    {
      id: "selection",
      header: t("admin_pair_table"),
      cell: ({ row }) => (
        <Button
          variant={tableId === row.original.id ? "default" : "outline"}
          className="min-w-28"
          aria-pressed={tableId === row.original.id}
          type="button"
          onClick={() =>
            void navigate({
              to: "/admin/stores/$storeId/devices/new",
              params: { storeId },
              search: { user_code: userCode, tableId: row.original.id },
              replace: true,
            })
          }
        >
          <Check className={`size-4 ${tableId === row.original.id ? "visible" : "invisible"}`} />
          {t(tableId === row.original.id ? "common_selected" : "common_select")}
        </Button>
      ),
    },
  ];
}
