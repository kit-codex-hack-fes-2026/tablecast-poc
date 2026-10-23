import { type Banner, type Configuration } from "@tablecast/api/schema";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { type ImageStagedChange } from "./configuration-image-model";
import { HotspotEditor, ThemeImageEditor } from "./design-image-editor";
import { emptyImage } from "./design-image-model";

export function BannersEditor({
  storeId,
  value,
  disabled,
  onChange,
  onStagedChange,
}: {
  disabled: boolean;
  onChange: (value: Configuration) => void;
  onStagedChange: ImageStagedChange;
  storeId: string;
  value: Configuration;
}) {
  const { t } = useI18n();
  const banners = value.banners ?? [];
  const updateBanner = (index: number, banner: Banner) =>
    onChange({ ...value, banners: banners.map((item, i) => (i === index ? banner : item)) });
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2>{t("theme_banners")}</h2>
      {banners.map((banner, index) => (
        <Disclosure.Root key={banner.id} defaultOpen className="rounded border border-border p-3">
          <Disclosure.Trigger>
            {t("theme_banner")} {index + 1}
          </Disclosure.Trigger>
          <Disclosure.Panel className="space-y-3">
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
          </Disclosure.Panel>
        </Disclosure.Root>
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
