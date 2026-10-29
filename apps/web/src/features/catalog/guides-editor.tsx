import type { Guide } from "@tablecast/api/schema";
import { resolveLocalized, resolveText } from "@tablecast/api/localization";
import { BookOpen, Link, UtensilsCrossed } from "lucide-react";
import type { EditorProps } from "../configuration/configuration-editor-model";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { BilingualFields, ConfigurationSection } from "../configuration/configuration-fields";
import { guideTemplates } from "../configuration/guide-model";
import { LanguageFields } from "../configuration/language-fields";

export function GuidesEditor({ value, onChange, disabled, selectedId }: EditorProps) {
  const { t, locale } = useI18n();
  const guide = value.guides?.find((item) => item.id === selectedId);
  if (!guide) return null;
  const relatedProducts = new Set(guide.productIds);
  const update = (change: Partial<Guide>) =>
    onChange({
      ...value,
      guides: value.guides?.map((item) => (item.id === selectedId ? { ...item, ...change } : item)),
    });
  return (
    <div className="space-y-6">
      <ConfigurationSection title={t("assistance_guides")} icon={BookOpen}>
        <label className="grid gap-2">
          {t("assistance_template")}
          <select
            disabled={disabled}
            className="min-h-12 rounded-lg border border-input bg-card px-3"
            value=""
            onChange={(event) => {
              const template = guideTemplates.find((item) => item.en === event.target.value);
              if (template)
                update({
                  text: {
                    ja: { ...guide.text.ja, displayName: template.ja, speechName: template.ja },
                    en: {
                      ...resolveText(guide.text, "en"),
                      displayName: template.en,
                      speechName: template.en,
                    },
                  },
                });
            }}
          >
            <option value="">{t("assistance_template_hint")}</option>
            {guideTemplates.map((item) => (
              <option key={item.en} value={item.en}>
                {resolveLocalized(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">{t("assistance_guide_hint")}</p>
        <BilingualFields
          value={guide.text}
          disabled={disabled}
          onChange={(text) => update({ text })}
        />
      </ConfigurationSection>
      <ConfigurationSection title={t("assistance_products")} icon={UtensilsCrossed}>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {value.products.map((product) => (
            <label
              key={product.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={relatedProducts.has(product.id)}
                onChange={(event) =>
                  update({
                    productIds: event.target.checked
                      ? [...guide.productIds, product.id]
                      : guide.productIds.filter((id) => id !== product.id),
                  })
                }
              />
              {resolveText(product.text, locale).displayName}
            </label>
          ))}
        </div>
      </ConfigurationSection>
      <ConfigurationSection title={t("assistance_links")} icon={Link}>
        {guide.links.map((link, index) => (
          <fieldset
            key={`${guide.id}-${index}`}
            disabled={disabled}
            className="space-y-3 rounded-lg border border-border p-3"
          >
            <LanguageFields>
              {(language, labelId) => (
                <label key={language} className="grid gap-1">
                  <span id={`${labelId}-link-${index}`}>{t("assistance_links")}</span>
                  <input
                    className="min-h-11 rounded-lg border border-input px-3"
                    aria-labelledby={`${labelId} ${labelId}-link-${index}`}
                    lang={language}
                    value={link.label[language] ?? ""}
                    onChange={(event) =>
                      update({
                        links: guide.links.map((item, position) =>
                          position === index
                            ? { ...item, label: { ...item.label, [language]: event.target.value } }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              )}
            </LanguageFields>
            <label className="grid gap-1">
              URL
              <input
                type="url"
                className="min-h-11 rounded-lg border border-input px-3"
                value={link.url}
                onChange={(event) =>
                  update({
                    links: guide.links.map((item, position) =>
                      position === index ? { ...item, url: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <Button
              variant="outline"
              onClick={() =>
                update({ links: guide.links.filter((_, position) => position !== index) })
              }
            >
              {t("common_remove")}
            </Button>
          </fieldset>
        ))}
        <Button
          variant="outline"
          disabled={disabled || guide.links.length >= 8}
          onClick={() =>
            update({ links: [...guide.links, { label: { ja: "", en: "" }, url: "" }] })
          }
        >
          {t("assistance_add_link")}
        </Button>
      </ConfigurationSection>
    </div>
  );
}
