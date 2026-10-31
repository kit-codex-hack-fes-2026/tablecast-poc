import {
  type Appearance,
  type ThemePart,
  themeParts,
  themePartSchema,
} from "@tablecast/api/schema";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

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

export function ThemePartsEditor({
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
          <Disclosure.Root key={part} className="rounded border border-border p-3">
            <Disclosure.Trigger>{t(partNames[part])}</Disclosure.Trigger>
            <Disclosure.Panel>
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
                          [name]:
                            event.target.value === "" ? undefined : Number(event.target.value),
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
                                  event.target.value === ""
                                    ? undefined
                                    : Number(event.target.value),
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
            </Disclosure.Panel>
          </Disclosure.Root>
        );
      })}
    </section>
  );
}
