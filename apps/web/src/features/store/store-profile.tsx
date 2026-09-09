import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Store } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { StoreIcon } from "../../components/store-icon";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { useStore } from "./store-shell";

export function StoreProfile() {
  const store = useStore();
  const { t } = useI18n();
  const client = useQueryClient();
  const manager = store.role === "owner" || store.role === "admin";
  const upload = useMutation({
    mutationFn: (image: File) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].icon.$post({
          param: { storeId: store.id },
          form: { image },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["tablecast-stores"] });
      await client.invalidateQueries({ queryKey: ["tablecast-membership", store.organizationId] });
    },
  });
  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Store />
        {t("store_profile")}
      </h1>
      <section
        aria-label={t("store_profile")}
        className="space-y-5 rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-center gap-4">
          <StoreIcon name={store.name} logo={store.logo} className="size-20 rounded-2xl text-2xl" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{store.name}</h2>
            <p className="text-sm text-muted-foreground">{t("store_icon_hint")}</p>
          </div>
          {manager && (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 hover:bg-secondary focus-within:outline-3 focus-within:outline-offset-2">
              <ImagePlus className="size-5" />
              {t("store_icon_change")}
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={upload.isPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) upload.mutate(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
        </div>
        {!manager && <p className="text-sm text-muted-foreground">{t("store_icon_permission")}</p>}
        <ErrorNotice error={upload.error} />
        <output className="flex min-h-6 items-center gap-2" aria-live="polite">
          {upload.isPending ? (
            t("common_loading")
          ) : upload.isSuccess ? (
            <>
              <Check className="size-5" />
              {t("account_saved")}
            </>
          ) : null}
        </output>
      </section>
    </>
  );
}
