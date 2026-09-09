import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { catalogOptions } from "../store/menu-query";

import { parseResponse, rpc } from "../../lib/api";

export function OpenTable({
  storeId,
  table,
  onOpened,
}: {
  storeId: string;
  table: { id: string; name: string };
  onOpened: () => void;
}) {
  const { t, locale } = useI18n();
  const [guests, setGuests] = useState(2);
  const [guestLocale, setGuestLocale] = useState<"ja" | "en">("ja");
  const [plan, setPlan] = useState("");
  const catalog = useQuery(catalogOptions(storeId));
  const client = useQueryClient();
  const open = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables.open.$post({
          param: { storeId: storeId },
          json: {
            tableId: table.id,
            guestCount: guests,
            locale: guestLocale,
            ...(plan ? { planId: plan } : {}),
          },
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-admin", storeId] });
      onOpened();
    },
  });
  return (
    <section className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">
        {table.name} · {t("admin_open_table")}
      </h1>
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
            onChange={(event) => setGuestLocale(event.target.value === "en" ? "en" : "ja")}
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
    </section>
  );
}
