import type { PosDeviceCode } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { Plus, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { zodFieldValidator } from "../../lib/form-validation";
import { posDevicesOptions } from "./pos-query";

export function PosDevicePicker({
  storeId,
  locationId,
  enabled,
  value,
  onChange,
}: {
  enabled: boolean;
  locationId: string;
  onChange: (value: string) => void;
  storeId: string;
  value: string;
}) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    ...posDevicesOptions(storeId, locationId),
    enabled: enabled && !!locationId,
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">
          {t("pos_device")}
          <NativeSelect
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
            disabled={!enabled || query.isPending}
          >
            <option value="">{t("pos_device_choose")}</option>
            {value && !query.data?.devices.some((device) => device.id === value) && (
              <option value={value}>{t("pos_device_current")}</option>
            )}
            {query.data?.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!hydrated || !enabled || !query.data?.canPair}
          onClick={() => setOpen(true)}
        >
          <Plus aria-hidden="true" />
          {t("pos_device_add")}
        </Button>
      </div>
      <ErrorNotice query={query} retrying={query.isFetching} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos_device_add")}</DialogTitle>
            <DialogClose aria-label={t("common_close")}>
              <X aria-hidden="true" />
            </DialogClose>
          </DialogHeader>
          {open && (
            <PosDevicePairing
              storeId={storeId}
              locationId={locationId}
              onPaired={(deviceId) => {
                onChange(deviceId);
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PosDevicePairing({
  storeId,
  locationId,
  onPaired,
}: {
  locationId: string;
  onPaired: (id: string) => void;
  storeId: string;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const [code, setCode] = useState<null | PosDeviceCode>(null);
  const key = useRef<null | string>(null);
  const endpoint = rpc.api.admin.stores[":storeId"].pos.devices;
  const receive = async (next: PosDeviceCode) => {
    setCode(next);
    if (next.status === "paired" && next.deviceId) {
      await client.invalidateQueries({ queryKey: posDevicesOptions(storeId, locationId).queryKey });
      onPaired(next.deviceId);
    }
  };
  const create = useMutation({
    mutationFn: (name: string) =>
      parseResponse(
        endpoint.$post({
          param: { storeId },
          json: { locationId, name, idempotencyKey: (key.current ??= crypto.randomUUID()) },
        }),
      ),
    onSuccess: receive,
  });
  const check = useMutation({
    mutationFn: () => {
      if (!code) throw new Error("POS_DEVICE_CODE_REQUIRED");
      return parseResponse(
        endpoint[":deviceCodeId"].$get({ param: { storeId, deviceCodeId: code.id } }),
      );
    },
    onSuccess: receive,
  });
  const form = useAppForm({
    defaultValues: { name: t("pos_device_default") },
    listeners: {
      onChange: () => {
        key.current = crypto.randomUUID();
      },
    },
    onSubmit: async ({ value }) => {
      if (code?.status === "expired") {
        key.current = crypto.randomUUID();
        setCode(null);
      }
      await create.mutateAsync(value.name).catch(() => undefined);
    },
  });
  return (
    <form.AppForm>
      <form.Form stopPropagation className="space-y-4">
        <form.AppField
          name="name"
          validators={{ onChange: zodFieldValidator(z.string().trim().min(1).max(100), locale) }}
        >
          {(field) => (
            <field.TextField
              label={t("pos_device_name")}
              maxLength={100}
              required
              disabled={create.isPending || (!!code && code.status !== "expired")}
            />
          )}
        </form.AppField>
        {code && (
          <div className="space-y-3">
            <DialogDescription>{t("pos_device_instruction")}</DialogDescription>
            {code.status !== "expired" && (
              <output className="block text-center font-mono text-3xl tracking-widest">
                {code.code}
              </output>
            )}
            {code.status === "expired" && (
              <p role="status" className="text-sm text-warning">
                {t("pos_device_expired")}
              </p>
            )}
            {code.status === "unknown" && (
              <p role="status" className="text-sm text-warning">
                {t("pos_device_unknown")}
              </p>
            )}
          </div>
        )}
        <form.FormErrors error={create.error} />
        <ErrorNotice error={check.error} />
        {code && code.status !== "expired" ? (
          <Button
            type="button"
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            <RefreshCw aria-hidden="true" />
            {t("pos_device_check")}
          </Button>
        ) : (
          <form.SubmitButton disabled={create.isPending}>
            {t("pos_device_generate")}
          </form.SubmitButton>
        )}
      </form.Form>
    </form.AppForm>
  );
}
