import type { AdminState } from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";

export function ApproveDevice({ state, onClose }: { state: AdminState; onClose: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [tableId, setTableId] = useState(state.tables[0]?.tableId ?? "");
  const approve = useMutation({
    mutationFn: () =>
      api(
        `/api/admin/stores/${state.store.id}/devices/approve`,
        json("POST", { userCode: code, tableId }),
      ),
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogClose aria-label={t("common_close")}>
            <X size={22} />
          </DialogClose>
        </DialogHeader>
        <DialogTitle>{t("admin_pair")}</DialogTitle>
        <DialogDescription>{t("pair_note")}</DialogDescription>
        <form
          className="flex flex-col gap-4 pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            approve.mutate();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            {t("admin_pair_code")}
            <Input
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              required
              maxLength={30}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            {t("admin_pair_table")}
            <NativeSelect
              value={tableId}
              onChange={(event) => setTableId(event.target.value)}
              required
            >
              {state.tables
                .filter((table) => table.status === "open")
                .map((table) => (
                  <option key={table.id} value={table.tableId}>
                    {table.tableName}
                  </option>
                ))}
            </NativeSelect>
          </label>
          <ErrorNotice error={approve.error} />
          <Button
            variant="default"
            size="lg"
            type="submit"

            disabled={approve.isPending || !tableId}
          >
            {t("admin_approve")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
