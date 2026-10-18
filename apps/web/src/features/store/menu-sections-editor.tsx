import { type Appearance, type Configuration, type MenuSection } from "@tablecast/api/schema";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { menuSections } from "../../components/menu-composition";
import { ProductMenu } from "../../components/product-menu";
import { StoreTheme } from "../../components/store-theme";
import { StoreLogo } from "../../components/store-logo";
import { Brand } from "../../components/brand";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { LocaleProvider, useI18n } from "../../i18n/locale";

const kinds = {
  intro: "theme_intro",
  story: "theme_story",
  products: "theme_products",
  artwork: "theme_artwork",
} as const;

export function MenuSectionsEditor({
  storeId,
  value,
  disabled,
  onChange,
}: {
  storeId: string;
  value: Configuration;
  disabled: boolean;
  onChange: (change: Partial<Appearance>) => void;
}) {
  const { t, locale } = useI18n();
  const sections = menuSections(value);
  const [selected, setSelected] = useState(sections[0]?.id);
  const [removed, setRemoved] = useState<{ section: MenuSection; index: number }>();
  const [width, setWidth] = useState("768");
  const [previewLocale, setPreviewLocale] = useState(locale);
  const current = sections.find((section) => section.id === selected);
  function sectionName(section: MenuSection) {
    const source = section.kind === "products" ? section.source : undefined;
    const category =
      source?.kind === "category"
        ? value.categories.find((item) => item.id === source.categoryId)
        : undefined;
    return section.title?.[locale] || category?.text[locale].displayName || t(kinds[section.kind]);
  }
  const update = (section: MenuSection) =>
    onChange({ sections: sections.map((item) => (item.id === section.id ? section : item)) });
  function add(kind: MenuSection["kind"]) {
    const id = crypto.randomUUID();
    const section: MenuSection =
      kind === "products"
        ? { id, kind, source: { kind: "all" }, layout: "list" }
        : kind === "artwork"
          ? { id, kind, bannerId: value.banners?.[0]?.id ?? "" }
          : { id, kind };
    onChange({ sections: [...sections, section] });
    setSelected(id);
  }
  function move(index: number, direction: number) {
    const next = [...sections];
    const item = next.splice(index, 1)[0];
    if (!item) return;
    next.splice(index + direction, 0, item);
    onChange({ sections: next });
  }
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("theme_menu_composition")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("theme_sections_hint")}</p>
      </header>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <ol
            className="max-h-80 space-y-1 overflow-y-auto rounded-xl p-1"
            aria-label={t("theme_sections")}
          >
            {sections.map((section, index) => (
              <li
                key={section.id}
                className="rounded-xl border border-border p-2 data-[selected=true]:border-primary data-[selected=true]:bg-secondary/50"
                data-selected={section.id === selected}
              >
                <Button
                  className="w-full justify-start text-left"
                  variant="ghost"
                  aria-pressed={section.id === selected}
                  disabled={disabled}
                  onClick={() => setSelected(section.id)}
                >
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate">{sectionName(section)}</span>
                </Button>
                <div
                  className="flex justify-end gap-1 [&[hidden]]:hidden"
                  hidden={section.id !== selected}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={disabled || index === 0}
                    aria-label={t("theme_move_up")}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={disabled || index === sections.length - 1}
                    aria-label={t("theme_move_down")}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={disabled || sections.length >= 40}
                    aria-label={t("theme_duplicate")}
                    onClick={() => {
                      const copy = { ...section, id: crypto.randomUUID() };
                      onChange({
                        sections: [
                          ...sections.slice(0, index + 1),
                          copy,
                          ...sections.slice(index + 1),
                        ],
                      });
                      setSelected(copy.id);
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={disabled || sections.length <= 1}
                    aria-label={t("common_remove")}
                    onClick={() => {
                      setRemoved({ section, index });
                      onChange({ sections: sections.filter((item) => item.id !== section.id) });
                      if (selected === section.id)
                        setSelected(sections[index + 1]?.id ?? sections[index - 1]?.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          {removed && (
            <Button
              variant="outline"
              disabled={disabled || sections.length >= 40}
              onClick={() => {
                const next = [...sections];
                next.splice(removed.index, 0, removed.section);
                onChange({ sections: next });
                setSelected(removed.section.id);
                setRemoved(undefined);
              }}
            >
              <Undo2 />
              {t("theme_restore_section")}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            {(["intro", "story", "products", "artwork"] as const).map((kind) => (
              <Button
                key={kind}
                variant="outline"
                disabled={
                  disabled ||
                  sections.length >= 40 ||
                  (kind === "artwork" && !value.banners?.length)
                }
                onClick={() => add(kind)}
              >
                <Plus />
                {t(kinds[kind])}
              </Button>
            ))}
          </div>
          {current && (
            <SectionSettings current={current} value={value} update={update} disabled={disabled} />
          )}
        </div>
        <div className="min-w-0 space-y-3 lg:sticky lg:top-40">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="mr-auto font-semibold">{t("theme_live_preview")}</h3>
            <NativeSelect
              aria-label={t("theme_preview_width")}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            >
              <option value="390">390 px</option>
              <option value="768">768 px</option>
              <option value="1024">1024 px</option>
            </NativeSelect>
            <NativeSelect
              aria-label={t("theme_preview_language")}
              value={previewLocale}
              onChange={(event) => setPreviewLocale(event.target.value === "en" ? "en" : "ja")}
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </NativeSelect>
          </div>
          <p className="text-xs text-muted-foreground">{t("theme_preview_local")}</p>
          {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 静的プレビューをSafariでもキーボードでスクロールできるようにする。 */}
          <div
            role="region"
            aria-label={t("theme_live_preview")}
            tabIndex={0}
            className="max-h-[70dvh] overflow-auto rounded-xl border border-border bg-muted p-3 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="mx-auto bg-background" style={{ width: Number(width) }}>
              <LocaleProvider
                key={previewLocale}
                initialLocale={previewLocale}
                persist={false}
                updateDocument={false}
              >
                <StoreTheme appearance={value.appearance}>
                  <div data-theme-part="screen">
                    <header
                      data-theme-part="header"
                      className="flex items-center gap-4 border-b border-border p-4"
                    >
                      <span className="[&_img]:w-24">
                        <Brand />
                      </span>
                      <StoreLogo
                        logo={value.branding?.logo}
                        width={value.appearance?.header?.logoWidth ?? 144}
                        height={value.appearance?.header?.logoHeight ?? 40}
                        fallback={value.storeName}
                      />
                    </header>
                    <div inert>
                      <ProductMenu
                        catalog={{
                          storeId,
                          storeName: value.storeName ?? "",
                          version: 0,
                          configuration: value,
                        }}
                        onChoose={() => undefined}
                      />
                    </div>
                  </div>
                </StoreTheme>
              </LocaleProvider>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionSettings({
  current,
  value,
  update,
  disabled,
}: {
  current: MenuSection;
  value: Configuration;
  update: (section: MenuSection) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <fieldset className="space-y-4 rounded-xl border border-border bg-card p-4" disabled={disabled}>
      <legend className="px-1 font-semibold">{t(kinds[current.kind])}</legend>
      {(["title", "body"] as const).map((field) => (
        <div key={field} className="grid gap-3">
          {(["ja", "en"] as const).map((language) => (
            <label key={language} className="grid gap-1 text-sm">
              {t(field === "title" ? "theme_section_title" : "theme_section_body")} ·{" "}
              {t(language === "ja" ? "common_ja" : "common_en")}
              {field === "title" ? (
                <Input
                  maxLength={3000}
                  value={current[field]?.[language] ?? ""}
                  onChange={(event) =>
                    update({
                      ...current,
                      [field]: {
                        ja: "",
                        en: "",
                        ...current[field],
                        [language]: event.target.value,
                      },
                    })
                  }
                />
              ) : (
                <textarea
                  className="min-h-24 rounded-lg border border-input bg-background p-3"
                  maxLength={3000}
                  value={current[field]?.[language] ?? ""}
                  onChange={(event) =>
                    update({
                      ...current,
                      [field]: {
                        ja: "",
                        en: "",
                        ...current[field],
                        [language]: event.target.value,
                      },
                    })
                  }
                />
              )}
            </label>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          {t("theme_alignment")}
          <NativeSelect
            value={current.align ?? "start"}
            onChange={(event) =>
              update({
                ...current,
                align: event.target.value === "center" ? "center" : "start",
              })
            }
          >
            <option value="start">{t("theme_start")}</option>
            <option value="center">{t("theme_center")}</option>
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm">
          {t("theme_section_spacing")}
          <NativeSelect
            value={current.spacing ?? "comfortable"}
            onChange={(event) =>
              update({
                ...current,
                spacing: event.target.value === "compact" ? "compact" : "comfortable",
              })
            }
          >
            <option value="comfortable">{t("theme_comfortable")}</option>
            <option value="compact">{t("theme_compact")}</option>
          </NativeSelect>
        </label>
      </div>
      {current.kind === "products" && (
        <>
          <label className="grid gap-1 text-sm">
            {t("theme_product_source")}
            <NativeSelect
              value={
                current.source.kind === "category" ? current.source.categoryId : current.source.kind
              }
              onChange={(event) =>
                update({
                  ...current,
                  source:
                    event.target.value === "all"
                      ? { kind: "all" }
                      : event.target.value === "selection"
                        ? {
                            kind: "selection",
                            productIds: value.products[0] ? [value.products[0].id] : [],
                          }
                        : { kind: "category", categoryId: event.target.value },
                })
              }
            >
              <option value="all">{t("kiosk_all")}</option>
              <option value="selection">{t("theme_selected_products")}</option>
              {value.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.text[locale].displayName}
                </option>
              ))}
            </NativeSelect>
          </label>
          {current.source.kind === "selection" && (
            <fieldset className="max-h-60 space-y-1 overflow-auto rounded-lg border border-border p-2">
              <legend>{t("theme_selected_products")}</legend>
              {value.products.map((product) => {
                const ids = current.source.kind === "selection" ? current.source.productIds : [];
                return (
                  <label key={product.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ids.includes(product.id)}
                      disabled={!ids.includes(product.id) && ids.length >= 100}
                      onChange={(event) =>
                        update({
                          ...current,
                          source: {
                            kind: "selection",
                            productIds: event.target.checked
                              ? [...ids, product.id]
                              : ids.filter((id) => id !== product.id),
                          },
                        })
                      }
                    />
                    {product.text[locale].displayName}
                  </label>
                );
              })}
            </fieldset>
          )}
          <label className="grid gap-1 text-sm">
            {t("theme_product_layout")}
            <NativeSelect
              value={current.layout}
              onChange={(event) =>
                update({
                  ...current,
                  layout:
                    event.target.value === "gallery"
                      ? "gallery"
                      : event.target.value === "feature"
                        ? "feature"
                        : "list",
                })
              }
            >
              <option value="list">{t("theme_layout_list")}</option>
              <option value="gallery">{t("theme_layout_gallery")}</option>
              <option value="feature">{t("theme_layout_feature")}</option>
            </NativeSelect>
          </label>
        </>
      )}
      {current.kind === "artwork" && (
        <label className="grid gap-1 text-sm">
          {t("theme_artwork")}
          <NativeSelect
            value={current.bannerId}
            onChange={(event) => update({ ...current, bannerId: event.target.value })}
          >
            {value.banners?.map((banner) => (
              <option key={banner.id} value={banner.id}>
                {banner.image.alt[locale] || banner.id}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {(current.kind === "intro" || current.kind === "story") && (
        <label className="grid gap-1 text-sm">
          {t("theme_asset")}
          <NativeSelect
            value={current.imageAsset ?? ""}
            onChange={(event) =>
              update({ ...current, imageAsset: event.target.value || undefined })
            }
          >
            <option value="">{t("theme_none")}</option>
            {Object.entries(value.appearance?.assets ?? {}).map(([name, image]) => (
              <option key={name} value={name}>
                {image.alt[locale] || name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(["background", "foreground"] as const).map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            {t(key === "background" ? "theme_background" : "theme_ink")}
            <Input
              type="color"
              value={
                current.style?.[key] === "transparent"
                  ? "#ffffff"
                  : (current.style?.[key] ?? (key === "background" ? "#fafafa" : "#18181b"))
              }
              onChange={(event) =>
                update({
                  ...current,
                  style: { ...current.style, [key]: event.target.value },
                })
              }
            />
          </label>
        ))}
      </div>
      <Button variant="outline" onClick={() => update({ ...current, style: undefined })}>
        {t("theme_inherit")}
      </Button>
    </fieldset>
  );
}
