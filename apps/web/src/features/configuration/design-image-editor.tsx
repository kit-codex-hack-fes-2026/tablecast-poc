import { type Banner, type Configuration, type ThemeImage } from "@tablecast/api/schema";
import { useRef } from "react";
import { ProductImage } from "../../components/product-image";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { ConfigurationImageField } from "./configuration-image-field";
import { type ImageStagedChange } from "./configuration-image-model";
import { emptyImage } from "./design-image-model";
import { LanguageFields } from "./language-fields";

export function ThemeImageEditor({
  storeId,
  value,
  onChange,
  disabled,
  onStagedChange,
}: {
  disabled: boolean;
  onChange: (image: null | ThemeImage) => void;
  onStagedChange: ImageStagedChange;
  storeId: string;
  value: null | ThemeImage;
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
        <LanguageFields>
          {(locale) => (
            <label className="grid gap-2">
              {t("theme_alt")}
              <Input
                disabled={disabled}
                value={value.alt[locale]}
                onChange={(event) =>
                  onChange({ ...value, alt: { ...value.alt, [locale]: event.target.value } })
                }
              />
            </label>
          )}
        </LanguageFields>
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

export function HotspotEditor({
  banner,
  configuration,
  onChange,
  disabled,
}: {
  banner: Banner;
  configuration: Configuration;
  disabled: boolean;
  onChange: (banner: Banner) => void;
}) {
  const { t, locale } = useI18n();
  const start = useRef<null | { x: number; y: number }>(null);

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
          <ProductImage
            responsive
            natural
            width={1600}
            height={600}
            sizes="100vw"
            src={`/media/${banner.image.imageKey}`}
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
                <option value={spot.productId}>{t("object_unknown_product")}</option>
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
