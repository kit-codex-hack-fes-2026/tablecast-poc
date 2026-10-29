import { type Configuration, themePartSchema } from "@tablecast/api/schema";
import { useMutation } from "@tanstack/react-query";
import { ActionFeedback } from "../../components/action-feedback";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { type ImageStagedChange } from "./configuration-image-model";
import { BannersEditor } from "./design-banners";
import { ThemeImageEditor } from "./design-image-editor";
import { emptyImage } from "./design-image-model";
import { ThemePartsEditor } from "./design-theme-parts";
import { MemberDesignEditor } from "./member-design-editor";
import { configurationImageUploadKey } from "./menu-query";
import { ThemeCompositionEditor } from "./theme-composition-editor";

export function DesignEditor({
  storeId,
  organisationLogo,
  value,
  onChange,
  disabled,
  onStagedChange,
}: {
  disabled: boolean;
  onChange: (configuration: Configuration) => void;
  onStagedChange: ImageStagedChange;
  organisationLogo?: null | string;
  storeId: string;
  value: Configuration;
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
          ...value.branding,
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
        <ActionFeedback mutation={importIcon} successMessage={t("account_saved")} />
        <ThemeImageEditor
          storeId={storeId}
          value={value.branding?.logo ?? null}
          disabled={disabled}
          onStagedChange={onStagedChange}
          onChange={(logo) => onChange({ ...value, branding: { ...value.branding, logo } })}
        />
      </section>
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2>{t("theme_header_banner")}</h2>
        <p>{t("theme_header_banner_hint")}</p>
        <ThemeImageEditor
          storeId={storeId}
          value={value.branding?.banner ?? null}
          disabled={disabled}
          onStagedChange={onStagedChange}
          onChange={(banner) =>
            onChange({ ...value, branding: { logo: null, ...value.branding, banner } })
          }
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
      </section>
      <MemberDesignEditor
        storeId={storeId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onStagedChange={onStagedChange}
      />
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2>{t("theme_assets")}</h2>
        <p>{t("theme_assets_hint")}</p>
        {Object.entries(assets).map(([name, image]) => (
          <Disclosure.Root key={name} className="rounded border border-border p-3">
            <Disclosure.Trigger>{name}</Disclosure.Trigger>
            <Disclosure.Panel>
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
            </Disclosure.Panel>
          </Disclosure.Root>
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
