import { ThemeCompositionEditor } from "./theme-composition-editor";
import { useMutation } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
import { configurationImageUploadKey } from "./menu-query";
import { ActionFeedback } from "../../components/action-feedback";
import {
  themeParts,
  themePartSchema,
  type Appearance,
  type Configuration,
  type ThemeImage,
  type Banner,
  type ThemePart,
} from "@tablecast/api/schema";
import { useRef } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { ConfigurationImageField, type ImageStagedChange } from "./configuration-image-field";

const partNames = {
  screen: "theme_screen",
  header: "theme_header",
  conversation: "theme_conversation",
  "voice-controls": "theme_voice_controls",
  menu: "theme_menu",
  "menu-masthead": "theme_masthead",
  banner: "theme_banner",
  "product-card": "theme_product_card",
  "category-button": "theme_category_button",
  "menu-tab": "theme_menu_tab",
  "action-button": "theme_action_button",
  checkout: "theme_checkout",
  dialog: "theme_dialog",
} as const;
const emptyImage: ThemeImage = {
  imageKey: "",
  imageKind: "illustration",
  imageSource: { generated: false, description: "" },
  alt: { ja: "", en: "" },
};
export function DesignEditor({
  storeId,
  organisationLogo,
  value,
  onChange,
  disabled,
  onStagedChange,
}: {
  storeId: string;
  organisationLogo?: string | null;
  value: Configuration;
  onChange: (configuration: Configuration) => void;
  disabled: boolean;
  onStagedChange: ImageStagedChange;
}) {
  const { t } = useI18n();
  const importIcon = useMutation({
    mutationKey: configurationImageUploadKey(storeId),
    mutationFn: async () => {
      if (!organisationLogo) throw new Error("IMAGE_NOT_FOUND");
      const response = await fetch(organisationLogo);
      if (!response.ok) throw new Error("IMAGE_NOT_FOUND");
      const blob = await response.blob();
      const image = new File([blob], "tablecast-store-logo", { type: blob.type });
      return parseResponse(
        rpc.api.admin.stores[":storeId"].images.$post({
          param: { storeId },
          form: {
            image,
            metadata: JSON.stringify({
              imageKind: "illustration",
              imageSource: { generated: false, description: t("theme_import_source") },
            }),
          },
        }),
      );
    },
    onSuccess: (image) =>
      onChange({
        ...value,
        branding: {
          logo: {
            imageKey: image.imageKey,
            imageKind: image.imageKind,
            imageSource: image.imageSource,
            alt: { ja: value.storeName ?? "", en: value.storeName ?? "" },
          },
        },
      }),
  });
  const appearance = value.appearance ?? {};
  const updateAppearance = (change: Partial<NonNullable<Configuration["appearance"]>>) =>
    onChange({ ...value, appearance: { ...appearance, ...change } });

  const assets = appearance.assets ?? {};
  return (
    <fieldset disabled={disabled || importIcon.isPending} className="min-w-0 space-y-6">
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2>{t("theme_logo")}</h2>
        <p>{t("theme_logo_hint")}</p>
        {organisationLogo && (
          <Button
            variant="outline"
            disabled={disabled || importIcon.isPending}
            onClick={() => importIcon.mutate()}
          >
            {t("theme_import_icon")}
          </Button>
        )}
        <ActionFeedback
          pending={importIcon.isPending}
          error={importIcon.error}
          success={importIcon.isSuccess}
          successMessage={t("account_saved")}
        />
        <ThemeImageEditor
          storeId={storeId}
          value={value.branding?.logo ?? null}
          disabled={disabled}
          onStagedChange={onStagedChange}
          onChange={(logo) => onChange({ ...value, branding: { logo } })}
        />
      </section>
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2>{t("theme_basics")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["ink", "paper", "accent"] as const).map((name) => (
            <label key={name}>
              {t(name === "ink" ? "theme_ink" : name === "paper" ? "theme_paper" : "theme_accent")}
              <Input
                type="color"
                disabled={disabled}
                value={
                  appearance.colours?.[name] ??
                  { ink: "#18181b", paper: "#fafafa", accent: "#18181b" }[name]
                }
                onChange={(event) =>
                  updateAppearance({
                    colours: {
                      ink: "#18181b",
                      paper: "#fafafa",
                      accent: "#18181b",
                      ...appearance.colours,
                      [name]: event.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["heading", "body"] as const).map((name) => (
            <label key={name}>
              {t(name === "heading" ? "theme_heading_font" : "theme_body_font")}
              <NativeSelect
                disabled={disabled}
                value={appearance.fonts?.[name] ?? "sans"}
                onChange={(event) => {
                  const font = themePartSchema.shape.font.parse(event.target.value);
                  if (font)
                    updateAppearance({
                      fonts: { heading: "sans", body: "sans", ...appearance.fonts, [name]: font },
                    });
                }}
              >
                <option value="sans">{t("theme_sans")}</option>
                <option value="serif">{t("theme_serif")}</option>
                <option value="rounded">{t("theme_rounded")}</option>
              </NativeSelect>
            </label>
          ))}
        </div>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() =>
            updateAppearance({
              colours: { ink: "#201a16", paper: "#fff8e7", accent: "#bb241c" },
              fonts: { heading: "serif", body: "sans" },
              parts: {
                ...appearance.parts,
                "product-card": {
                  background: "#fff8e7",
                  foreground: "#201a16",
                  borderColor: "#201a16",
                  borderWidth: 3,
                  radius: 4,
                  shadow: "offset",
                },
                "category-button": { borderColor: "#201a16", borderWidth: 2, radius: 4 },
              },
            })
          }
        >
          {t("theme_ramen_preset")}
        </Button>
      </section>
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2>{t("theme_assets")}</h2>
        <p>{t("theme_assets_hint")}</p>
        {Object.entries(assets).map(([name, image]) => (
          <details key={name} className="rounded border border-border p-3">
            <summary>{name}</summary>
            <ThemeImageEditor
              storeId={storeId}
              value={image}
              disabled={disabled}
              onStagedChange={onStagedChange}
              onChange={(next) => {
                if (next) updateAppearance({ assets: { ...assets, [name]: next } });
                else {
                  const rest = { ...assets };
                  delete rest[name];
                  updateAppearance({ assets: rest });
                }
              }}
            />
          </details>
        ))}
        <Button
          variant="outline"
          disabled={disabled || Object.keys(assets).length >= 20}
          onClick={() =>
            updateAppearance({
              assets: {
                ...assets,
                [`image-${crypto.randomUUID().slice(0, 8)}`]: structuredClone(emptyImage),
              },
            })
          }
        >
          {t("theme_add_asset")}
        </Button>
      </section>
      <ThemeCompositionEditor
        appearance={appearance}
        disabled={disabled}
        onChange={updateAppearance}
      />
      <ThemePartsEditor
        appearance={appearance}
        disabled={disabled}
        updateAppearance={updateAppearance}
      />
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2>{t("theme_css")}</h2>
        <p>{t("theme_css_hint")}</p>
        <textarea
          aria-label={t("theme_css")}
          className="min-h-48 w-full rounded border border-input p-3 font-mono text-sm"
          value={appearance.customCss ?? ""}
          disabled={disabled}
          onChange={(event) => updateAppearance({ customCss: event.target.value })}
        />
      </section>
      <BannersEditor
        storeId={storeId}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onStagedChange={onStagedChange}
      />
    </fieldset>
  );
}
function ThemeImageEditor({
  storeId,
  value,
  onChange,
  disabled,
  onStagedChange,
}: {
  storeId: string;
  value: ThemeImage | null;
  onChange: (image: ThemeImage | null) => void;
  disabled: boolean;
  onStagedChange: ImageStagedChange;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <ConfigurationImageField
        key={value?.imageKey ?? ""}
        storeId={storeId}
        value={value ?? { imageKey: null, imageKind: "illustration" }}
        disabled={disabled}
        onStagedChange={onStagedChange}
        onChange={(image) =>
          onChange(
            image.imageKey
              ? {
                  ...emptyImage,
                  ...value,
                  ...image,
                  imageKey: image.imageKey,
                  imageSource: image.imageSource ?? emptyImage.imageSource,
                }
              : null,
          )
        }
      />
      {value && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["ja", "en"] as const).map((locale) => (
            <label key={locale}>
              {t("theme_alt")} ({locale})
              <Input
                disabled={disabled}
                value={value.alt[locale]}
                onChange={(event) =>
                  onChange({ ...value, alt: { ...value.alt, [locale]: event.target.value } })
                }
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
const point = (event: React.PointerEvent<HTMLButtonElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
};
function HotspotEditor({
  banner,
  configuration,
  onChange,
  disabled,
}: {
  banner: Banner;
  configuration: Configuration;
  onChange: (banner: Banner) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const start = useRef<{ x: number; y: number } | null>(null);

  const add = (rect: Banner["hotspots"][number]["rect"]) => {
    const product = configuration.products[0];
    if (product && banner.hotspots.length < 20)
      onChange({
        ...banner,
        hotspots: [...banner.hotspots, { id: crypto.randomUUID(), productId: product.id, rect }],
      });
  };
  return (
    <div className="space-y-3">
      <p>{t("theme_draw_hint")}</p>
      {banner.image.imageKey && (
        <div className="relative">
          <img
            src={`/media/${banner.image.imageKey}?width=1600`}
            alt={banner.image.alt[locale]}
            className="block h-auto w-full"
          />
          <button
            type="button"
            aria-label={t("theme_draw_region")}
            disabled={disabled}
            className="absolute inset-0 touch-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              start.current = point(event);
            }}
            onPointerCancel={() => {
              start.current = null;
            }}
            onPointerUp={(event) => {
              if (!start.current) return;
              const end = point(event);
              const rect = {
                x: Math.min(start.current.x, end.x),
                y: Math.min(start.current.y, end.y),
                width: Math.abs(start.current.x - end.x),
                height: Math.abs(start.current.y - end.y),
              };
              start.current = null;
              if (rect.width > 0.01 && rect.height > 0.01) add(rect);
            }}
          />
          {banner.hotspots.map((spot, index) => (
            <span
              key={spot.id}
              className="pointer-events-none absolute border-2 border-primary bg-primary/15 text-foreground"
              style={{
                left: `${spot.rect.x * 100}%`,
                top: `${spot.rect.y * 100}%`,
                width: `${spot.rect.width * 100}%`,
                height: `${spot.rect.height * 100}%`,
              }}
            >
              {index + 1}
            </span>
          ))}
        </div>
      )}
      {banner.hotspots.map((spot, index) => (
        <fieldset
          key={spot.id}
          className="grid gap-2 rounded border border-border p-3 sm:grid-cols-4"
        >
          <legend>
            {t("theme_region")} {index + 1}
          </legend>
          <label className="sm:col-span-4">
            {t("theme_product")}
            <NativeSelect
              disabled={disabled}
              value={spot.productId}
              onChange={(event) =>
                onChange({
                  ...banner,
                  hotspots: banner.hotspots.map((item, i) =>
                    i === index ? { ...item, productId: event.target.value } : item,
                  ),
                })
              }
            >
              {!configuration.products.some((item) => item.id === spot.productId) && (
                <option value={spot.productId}>{spot.productId}</option>
              )}
              {configuration.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.text[locale].displayName}
                </option>
              ))}
            </NativeSelect>
          </label>
          {(["x", "y", "width", "height"] as const).map((name) => (
            <label key={name}>
              {t(
                name === "x"
                  ? "theme_x"
                  : name === "y"
                    ? "theme_y"
                    : name === "width"
                      ? "theme_width"
                      : "theme_height",
              )}
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                value={spot.rect[name]}
                onChange={(event) =>
                  onChange({
                    ...banner,
                    hotspots: banner.hotspots.map((item, i) =>
                      i === index
                        ? { ...item, rect: { ...item.rect, [name]: Number(event.target.value) } }
                        : item,
                    ),
                  })
                }
              />
            </label>
          ))}
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange({ ...banner, hotspots: banner.hotspots.filter((_, i) => i !== index) })
            }
          >
            {t("common_remove")}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        disabled={disabled || !configuration.products.length || banner.hotspots.length >= 20}
        onClick={() => add({ x: 0, y: 0, width: 1, height: 1 })}
      >
        {t("theme_add_region")}
      </Button>
    </div>
  );
}

function ThemePartsEditor({
  appearance,
  disabled,
  updateAppearance,
}: {
  appearance: Appearance;
  disabled: boolean;
  updateAppearance: (change: Partial<Appearance>) => void;
}) {
  const { t } = useI18n();
  const assets = appearance.assets ?? {};
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2>{t("theme_parts")}</h2>
      <p>{t("theme_protection_hint")}</p>
      {themeParts.map((part) => {
        const style = appearance.parts?.[part] ?? {};
        const update = (change: Partial<ThemePart>) =>
          updateAppearance({ parts: { ...appearance.parts, [part]: { ...style, ...change } } });
        return (
          <details key={part} className="rounded border border-border p-3">
            <summary>{t(partNames[part])}</summary>
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              {(["background", "foreground", "borderColor"] as const).map((name) => (
                <label key={name}>
                  {t(
                    name === "background"
                      ? "theme_background"
                      : name === "foreground"
                        ? "theme_ink"
                        : "theme_border_colour",
                  )}
                  <Input
                    type="color"
                    disabled={disabled}
                    value={
                      style[name] === "transparent"
                        ? "#ffffff"
                        : (style[name] ?? (name === "background" ? "#ffffff" : "#18181b"))
                    }
                    onChange={(event) => update({ [name]: event.target.value })}
                  />
                </label>
              ))}
              <label className="flex items-center gap-2">
                <Input
                  type="checkbox"
                  checked={style.background === "transparent"}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ background: event.target.checked ? "transparent" : undefined })
                  }
                />
                {t("theme_transparent")}
              </label>
              {(["radius", "borderWidth"] as const).map((name) => (
                <label key={name}>
                  {t(name === "radius" ? "theme_radius" : "theme_border_width")}
                  <Input
                    type="number"
                    min={0}
                    max={name === "radius" ? 24 : 4}
                    disabled={disabled}
                    value={style[name] ?? ""}
                    onChange={(event) =>
                      update({
                        [name]: event.target.value === "" ? undefined : Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}
              <label>
                {t("theme_shadow")}
                <NativeSelect
                  disabled={disabled}
                  value={style.shadow ?? "none"}
                  onChange={(event) =>
                    update({ shadow: themePartSchema.shape.shadow.parse(event.target.value) })
                  }
                >
                  <option value="none">{t("theme_none")}</option>
                  <option value="soft">{t("theme_soft")}</option>
                  <option value="offset">{t("theme_offset")}</option>
                </NativeSelect>
              </label>
              <label>
                {t("theme_part_font")}
                <NativeSelect
                  disabled={disabled}
                  value={style.font ?? ""}
                  onChange={(event) =>
                    update({
                      font: event.target.value
                        ? themePartSchema.shape.font.parse(event.target.value)
                        : undefined,
                    })
                  }
                >
                  <option value="">{t("theme_default")}</option>
                  <option value="sans">{t("theme_sans")}</option>
                  <option value="serif">{t("theme_serif")}</option>
                  <option value="rounded">{t("theme_rounded")}</option>
                </NativeSelect>
              </label>
              <label>
                {t("theme_asset")}
                <NativeSelect
                  disabled={disabled}
                  value={style.image?.asset ?? ""}
                  onChange={(event) =>
                    update({
                      image: event.target.value
                        ? { asset: event.target.value, fit: "cover", x: 50, y: 50, opacity: 1 }
                        : undefined,
                    })
                  }
                >
                  <option value="">{t("theme_none")}</option>
                  {Object.keys(assets).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </NativeSelect>
              </label>
              {style.image && (
                <>
                  <label>
                    {t("theme_image_fit")}
                    <NativeSelect
                      disabled={disabled}
                      value={style.image.fit}
                      onChange={(event) => {
                        if (style.image)
                          update({
                            image: {
                              ...style.image,
                              fit: themePartSchema.shape.image
                                .unwrap()
                                .shape.fit.parse(event.target.value),
                            },
                          });
                      }}
                    >
                      <option value="contain">{t("theme_contain")}</option>
                      <option value="cover">{t("theme_cover")}</option>
                      <option value="repeat">{t("theme_repeat")}</option>
                    </NativeSelect>
                  </label>
                  <label>
                    {t(style.image.fit === "repeat" ? "theme_tile_size" : "theme_image_width")}
                    <Input
                      type="number"
                      disabled={disabled}
                      min={style.image.fit === "repeat" ? 32 : 10}
                      max={style.image.fit === "repeat" ? 1024 : 200}
                      value={
                        (style.image.fit === "repeat"
                          ? style.image.tileSize
                          : style.image.widthPercent) ?? ""
                      }
                      onChange={(event) => {
                        if (style.image)
                          update({
                            image: {
                              ...style.image,
                              [style.image.fit === "repeat" ? "tileSize" : "widthPercent"]:
                                event.target.value === "" ? undefined : Number(event.target.value),
                            },
                          });
                      }}
                    />
                  </label>
                  {(["x", "y", "opacity"] as const).map((name) => (
                    <label key={name}>
                      {t(name === "x" ? "theme_x" : name === "y" ? "theme_y" : "theme_opacity")}
                      <Input
                        type="range"
                        min={0}
                        max={name === "opacity" ? 1 : 100}
                        step={name === "opacity" ? 0.05 : 1}
                        disabled={disabled}
                        value={style.image?.[name]}
                        onChange={(event) => {
                          if (style.image)
                            update({
                              image: { ...style.image, [name]: Number(event.target.value) },
                            });
                        }}
                      />
                    </label>
                  ))}
                </>
              )}
            </div>
            <Button
              className="mt-3"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const parts = { ...appearance.parts };
                delete parts[part];
                updateAppearance({ parts });
              }}
            >
              {t("theme_reset_part")}
            </Button>
          </details>
        );
      })}
    </section>
  );
}

function BannersEditor({
  storeId,
  value,
  disabled,
  onChange,
  onStagedChange,
}: {
  storeId: string;
  value: Configuration;
  disabled: boolean;
  onChange: (value: Configuration) => void;
  onStagedChange: ImageStagedChange;
}) {
  const { t } = useI18n();
  const banners = value.banners ?? [];
  const updateBanner = (index: number, banner: Banner) =>
    onChange({ ...value, banners: banners.map((item, i) => (i === index ? banner : item)) });
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2>{t("theme_banners")}</h2>
      {banners.map((banner, index) => (
        <details key={banner.id} open className="space-y-3 rounded border border-border p-3">
          <summary>
            {t("theme_banner")} {index + 1}
          </summary>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={disabled}
              checked={banner.enabled}
              onChange={(event) =>
                updateBanner(index, { ...banner, enabled: event.target.checked })
              }
            />
            {t("theme_visible")}
          </label>
          <ThemeImageEditor
            storeId={storeId}
            value={banner.image}
            disabled={disabled}
            onStagedChange={onStagedChange}
            onChange={(image) =>
              updateBanner(index, { ...banner, image: image ?? structuredClone(emptyImage) })
            }
          />
          <label>
            {t("theme_banner_span")}
            <NativeSelect
              disabled={disabled}
              value={banner.span ?? "column"}
              onChange={(event) =>
                updateBanner(index, {
                  ...banner,
                  span: event.target.value === "full" ? "full" : "column",
                })
              }
            >
              <option value="column">{t("theme_banner_column")}</option>
              <option value="full">{t("theme_banner_full")}</option>
            </NativeSelect>
          </label>
          <HotspotEditor
            banner={banner}
            configuration={value}
            disabled={disabled}
            onChange={(next) => updateBanner(index, next)}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={disabled || index === 0}
              onClick={() => {
                const next = [...banners];
                next.splice(index, 1);
                next.splice(index - 1, 0, banner);
                onChange({ ...value, banners: next });
              }}
            >
              {t("theme_move_up")}
            </Button>
            <Button
              variant="outline"
              disabled={disabled || index === banners.length - 1}
              onClick={() => {
                const next = [...banners];
                next.splice(index, 1);
                next.splice(index + 1, 0, banner);
                onChange({ ...value, banners: next });
              }}
            >
              {t("theme_move_down")}
            </Button>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() =>
                onChange({ ...value, banners: banners.filter((item) => item.id !== banner.id) })
              }
            >
              {t("common_remove")}
            </Button>
          </div>
        </details>
      ))}
      <Button
        variant="outline"
        disabled={disabled || banners.length >= 12}
        onClick={() =>
          onChange({
            ...value,
            banners: [
              ...banners,
              {
                id: crypto.randomUUID(),
                enabled: true,
                image: structuredClone(emptyImage),
                hotspots: [],
              },
            ],
          })
        }
      >
        {t("theme_add_banner")}
      </Button>
    </section>
  );
}
