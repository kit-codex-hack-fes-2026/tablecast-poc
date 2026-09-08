import { catalogSchema } from "@tablecast/api/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";

export function OpenTable({
  storeId,
  table,
  onClose,
  onOpened,
}: {
  storeId: string;
  table: { id: string; name: string };
  onClose: () => void;
  onOpened: () => void;
}) {
  const { t, locale } = useI18n();
  const [guests, setGuests] = useState(2);
  const [guestLocale, setGuestLocale] = useState("ja");
  const [plan, setPlan] = useState("");
  const catalog = useQuery({
    queryKey: ["tablecast-admin-catalog", storeId],
    queryFn: () => api(`/api/admin/stores/${storeId}/catalog`, {}, catalogSchema),
  });
  const open = useMutation({
    mutationFn: () =>
      api(
        `/api/admin/stores/${storeId}/tables/open`,
        json("POST", {
          tableId: table.id,
          guestCount: guests,
          locale: guestLocale,
          ...(plan ? { planId: plan } : {}),
        }),
      ),
    onSuccess: onOpened,
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <span className="eyebrow block text-sm leading-relaxed tracking-widest font-semibold text-muted-foreground">
            {table.name}
          </span>
          <DialogClose aria-label={t("common_close")}>
            <X size={22} />
          </DialogClose>
        </DialogHeader>
        <DialogTitle>{t("admin_open_table")}</DialogTitle>
        <form
          className="flex flex-col gap-4 pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            open.mutate();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            {t("admin_guest_count")}
            <Input
              type="number"
              min={1}
              max={30}
              required
              value={guests}
              onChange={(event) => setGuests(Number(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            {t("admin_locale")}
            <NativeSelect
              value={guestLocale}
              onChange={(event) => setGuestLocale(event.target.value)}
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            {t("kiosk_plan")}
            <NativeSelect value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="">{t("admin_no_plan")}</option>
              {catalog.data?.configuration.plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.text[locale].displayName}
                </option>
              ))}
            </NativeSelect>
          </label>
          <ErrorNotice error={open.error || catalog.error} />
          <Button
            variant="default"
            size="lg"
            type="submit"

            disabled={open.isPending}
          >
            {t("admin_open_table")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
