import { Checkbox } from "@base-ui/react/checkbox";
import { Dialog } from "@base-ui/react/dialog";
import { configDraftSchema } from "@tablecast/api/schema";
import type { ConfigDraft, Configuration, Product } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { money, useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";
import { draftsSchema } from "../../lib/responses";

export function SettingsDrafts({
  storeId,
  initialDraftId,
}: {
  storeId: string;
  initialDraftId?: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const base = `/api/admin/stores/${storeId}/drafts`;
  const [selectedId, setSelectedId] = useState(initialDraftId);
  const drafts = useQuery({
    queryKey: ["tablecast-drafts", storeId],
    queryFn: () => api(base, {}, draftsSchema),
  });
  const selected = useQuery({
    queryKey: ["tablecast-draft", storeId, selectedId],
    queryFn: () => api(`${base}/${selectedId}`, {}, configDraftSchema),
    enabled: !!selectedId,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <section className="settings-panel">
      <h2>{t("admin_drafts")}</h2>
      <ErrorNotice error={drafts.error || selected.error} />
      {drafts.data?.drafts
        .filter((draft) => draft.status === "draft" || draft.status === "ready")
        .map((draft) => (
          <div key={draft.id} className="draft-card" data-draft-id={draft.id}>
            <div>
              <strong>
                {t("admin_published_version")} {draft.baseVersion} · {t("admin_draft_version")}{" "}
                {draft.version}
              </strong>
              <p>
                {draft.changes.length} {t("admin_change_count")}
              </p>
            </div>
            <Button variant="outline" type="button" onClick={() => setSelectedId(draft.id)}>
              {t("admin_review_draft")}
            </Button>
          </div>
        ))}
      {drafts.data?.drafts.every(
        (draft) => draft.status !== "draft" && draft.status !== "ready",
      ) && <p className="empty-note">{t("admin_no_drafts")}</p>}
      {selectedId && selected.data && (
        <DraftDialog
          key={selectedId}
          initialDraft={selected.data}
          base={base}
          onSaved={(draft) => {
            client.setQueryData(["tablecast-draft", storeId, draft.id], draft);
            void drafts.refetch();
          }}
          onClose={() => setSelectedId((current) => (current === selectedId ? undefined : current))}
        />
      )}
    </section>
  );
}

function DraftDialog({
  initialDraft,
  base,
  onSaved,
  onClose,
}: {
  initialDraft: ConfigDraft;
  base: string;
  onSaved: (draft: ConfigDraft) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState(initialDraft);
  const [configuration, setConfiguration] = useState(initialDraft.configuration);
  const [productId, setProductId] = useState(initialDraft.configuration.products[0]?.id ?? "");
  const [publishKey] = useState(() => crypto.randomUUID());
  const product = configuration.products.find((item) => item.id === productId);
  const dirty = JSON.stringify(configuration) !== JSON.stringify(draft.configuration);
  const editable = draft.status === "draft" || draft.status === "ready";
  function saved(next: ConfigDraft) {
    setDraft(next);
    setConfiguration(next.configuration);
    onSaved(next);
  }
  const save = useMutation({
    mutationFn: (next: Configuration) =>
      api(
        `${base}/${draft.id}`,
        json("PUT", { expectedVersion: draft.version, configuration: next }),
        configDraftSchema,
      ),
    onSuccess: saved,
  });
  const validate = useMutation({
    mutationFn: () =>
      api(
        `${base}/${draft.id}/validate`,
        json("POST", { expectedVersion: draft.version }),
        configDraftSchema,
      ),
    onSuccess: saved,
  });
  const publish = useMutation({
    mutationFn: () =>
      api(
        `${base}/${draft.id}/publish`,
        json("POST", {
          expectedVersion: draft.version,
          baseVersion: draft.baseVersion,
          idempotencyKey: publishKey,
          approved: true,
        }),
        configDraftSchema,
      ),
    onSuccess: (published) => {
      onSaved(published);
      onClose();
    },
  });
  const busy = save.isPending || validate.isPending || publish.isPending;
  function changeProduct(change: Partial<Product>) {
    setConfiguration((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.id === productId ? { ...item, ...change } : item,
      ),
    }));
  }
  const fields = [
    { key: "displayName", label: t("admin_display_name") },
    { key: "speechName", label: t("admin_speech_name") },
    { key: "description", label: t("admin_description") },
  ] as const;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog config-dialog">
            <div className="dialog-heading">
              <Dialog.Close className="icon-button" aria-label={t("common_close")}>
                <X size={22} />
              </Dialog.Close>
            </div>
            <Dialog.Title>{t("admin_config")}</Dialog.Title>
            <Dialog.Description className="sr-only">{t("admin_draft_note")}</Dialog.Description>
            <div className="dialog-scroll">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate(configuration);
                }}
              >
                <fieldset className="stacked-form min-w-0 pt-0" disabled={busy || !editable}>
                  <label>
                    {t("admin_product")}
                    <select
                      className="h-12 rounded-lg border border-input px-3 text-sm"
                      value={productId}
                      onChange={(event) => {
                        if (event.currentTarget.form?.reportValidity())
                          setProductId(event.target.value);
                      }}
                    >
                      {configuration.products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.text[locale].displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {product && (
                    <>
                      <label>
                        {t("admin_unit_price")}
                        <Input
                          type="number"
                          min={0}
                          max={10_000_000}
                          step={1}
                          required
                          value={Number.isFinite(product.price) ? product.price : ""}
                          onChange={(event) => changeProduct({ price: event.target.valueAsNumber })}
                        />
                      </label>
                      <label className="checkbox-label flex-row">
                        <Checkbox.Root
                          className="checkbox-control"
                          checked={product.available}
                          disabled={busy || !editable}
                          onCheckedChange={(available) => changeProduct({ available })}
                        >
                          <Checkbox.Indicator>
                            <Check size={16} />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                        <span>{t("admin_available")}</span>
                      </label>
                      <div className="grid gap-5 sm:grid-cols-2">
                        {(["ja", "en"] as const).map((language) => (
                          <fieldset key={language} className="stacked-form min-w-0 pt-0">
                            <legend className="mb-3 font-semibold">
                              {t(language === "ja" ? "common_ja" : "common_en")}
                            </legend>
                            {fields.map(({ key, label }) => (
                              <label key={key}>
                                {label}
                                {key === "description" ? (
                                  <textarea
                                    className="min-h-24 w-full rounded-lg border border-input p-2 text-sm"
                                    maxLength={3000}
                                    value={product.text[language][key]}
                                    onChange={(event) =>
                                      changeProduct({
                                        text: {
                                          ...product.text,
                                          [language]: {
                                            ...product.text[language],
                                            [key]: event.target.value,
                                          },
                                        },
                                      })
                                    }
                                  />
                                ) : (
                                  <Input
                                    required
                                    maxLength={150}
                                    value={product.text[language][key]}
                                    onChange={(event) =>
                                      changeProduct({
                                        text: {
                                          ...product.text,
                                          [language]: {
                                            ...product.text[language],
                                            [key]: event.target.value,
                                          },
                                        },
                                      })
                                    }
                                  />
                                )}
                              </label>
                            ))}
                          </fieldset>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="submit" disabled={!dirty}>
                          {t("common_save")}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          disabled={!dirty}
                          onClick={() => setConfiguration(draft.configuration)}
                        >
                          {t("common_cancel")}
                        </Button>
                      </div>
                    </>
                  )}
                </fieldset>
              </form>
              {dirty && <output className="notice">{t("admin_unsaved")}</output>}
              {draft.errors.length > 0 && (
                <ul className="validation-errors">
                  {draft.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
              <h3 className="mt-6 font-semibold">{t("admin_saved_changes")}</h3>
              {draft.changes.some((change) => change.sensitive) && (
                <div className="notice">{t("admin_sensitive")}</div>
              )}
              {draft.changes.map((change) => {
                const [collection, index, section, language] = change.path.split(".");
                const changedLanguage =
                  section === "text" && (language === "ja" || language === "en")
                    ? t(language === "ja" ? "common_ja" : "common_en")
                    : undefined;
                const changedProduct =
                  collection === "products"
                    ? draft.configuration.products[Number(index)]
                    : undefined;
                const field = changedLanguage
                  ? fields.find(
                      (item) => change.path === `products.${index}.text.${language}.${item.key}`,
                    )
                  : [
                      { key: "price", label: t("admin_unit_price") },
                      { key: "available", label: t("admin_available") },
                    ].find((item) => change.path === `products.${index}.${item.key}`);
                return (
                  <div className="config-change" key={change.path}>
                    <strong>
                      {changedProduct && field
                        ? [changedProduct.text[locale].displayName, changedLanguage, field.label]
                            .filter(Boolean)
                            .join(" · ")
                        : change.path}
                    </strong>
                    <div>
                      {[
                        { label: t("admin_before"), value: change.before },
                        { label: t("admin_after"), value: change.after },
                      ].map(({ label, value }) => (
                        <section key={label}>
                          <h4>{label}</h4>
                          <pre>
                            {field?.key === "price" && typeof value === "number"
                              ? money(value, locale)
                              : field?.key === "available" && typeof value === "boolean"
                                ? t(value ? "admin_available" : "kiosk_sold_out")
                                : typeof value === "string"
                                  ? value
                                  : JSON.stringify(value, null, 2)}
                          </pre>
                        </section>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <ErrorNotice error={save.error || validate.error || publish.error} />
            <div className="dialog-actions">
              <Button
                variant="outline"
                type="button"
                className="secondary-button"
                disabled={!editable || dirty || busy}
                onClick={() => validate.mutate()}
              >
                {t("admin_validate")}
              </Button>
              <Button
                size="lg"
                type="button"
                className="primary-button"
                disabled={draft.status !== "ready" || draft.errors.length > 0 || dirty || busy}
                onClick={() => publish.mutate()}
              >
                {t("admin_publish")}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
