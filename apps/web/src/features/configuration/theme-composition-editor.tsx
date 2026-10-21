import type { Appearance } from "@tablecast/api/schema";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

export function ThemeCompositionEditor({
  appearance,
  disabled,
  onChange,
}: {
  appearance: Appearance;
  disabled: boolean;
  onChange: (change: Partial<Appearance>) => void;
}) {
  const { t } = useI18n();
  const composition = appearance.composition ?? {};
  const masthead = composition.masthead ?? {
    visible: false,
    align: "center",
    logoWidth: 280,
    logoHeight: 96,
    padding: 16,
  };
  const banners = composition.banners ?? { columns: 1, gap: 12 };
  const update = (value: Partial<typeof masthead>) =>
    onChange({ composition: { ...composition, masthead: { ...masthead, ...value } } });
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2>{t("theme_composition")}</h2>
      <p>{t("theme_composition_hint")}</p>
      <label className="flex items-center gap-2">
        <Input
          type="checkbox"
          disabled={disabled}
          checked={masthead.visible}
          onChange={(event) => update({ visible: event.target.checked })}
        />
        {t("theme_masthead_visible")}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          {t("theme_alignment")}
          <NativeSelect
            disabled={disabled}
            value={masthead.align}
            onChange={(event) =>
              update({ align: event.target.value === "start" ? "start" : "center" })
            }
          >
            <option value="center">{t("theme_center")}</option>
            <option value="start">{t("theme_start")}</option>
          </NativeSelect>
        </label>
        {(["logoWidth", "logoHeight", "padding"] as const).map((key) => (
          <label key={key}>
            {t(
              key === "logoWidth"
                ? "theme_logo_width"
                : key === "logoHeight"
                  ? "theme_logo_height"
                  : "theme_spacing",
            )}
            <Input
              type="number"
              disabled={disabled}
              min={key === "logoWidth" ? 120 : key === "logoHeight" ? 40 : 0}
              max={key === "logoWidth" ? 360 : key === "logoHeight" ? 160 : 32}
              value={masthead[key]}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <label>
          {t("theme_banner_columns")}
          <NativeSelect
            disabled={disabled}
            value={banners.columns}
            onChange={(event) =>
              onChange({
                composition: {
                  ...composition,
                  banners: { ...banners, columns: event.target.value === "2" ? 2 : 1 },
                },
              })
            }
          >
            <option value="1">{t("theme_one_column")}</option>
            <option value="2">{t("theme_two_columns")}</option>
          </NativeSelect>
        </label>
        <label>
          {t("theme_banner_gap")}
          <Input
            type="number"
            min={8}
            max={32}
            disabled={disabled}
            value={banners.gap}
            onChange={(event) =>
              onChange({
                composition: {
                  ...composition,
                  banners: { ...banners, gap: Number(event.target.value) },
                },
              })
            }
          />
        </label>
      </div>
    </section>
  );
}
