import type { Configuration } from "@tablecast/api/schema";
import type { ImageStagedChange } from "./configuration-image-model";
import { MembershipCard } from "../../components/membership-card";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { ThemeImageEditor } from "./design-image-editor";

export function MemberDesignEditor({
  storeId,
  value,
  onChange,
  disabled,
  onStagedChange,
}: {
  disabled: boolean;
  onChange: (value: Configuration) => void;
  onStagedChange: ImageStagedChange;
  storeId: string;
  value: Configuration;
}) {
  const { t } = useI18n();
  const branding = { logo: null, ...value.branding };
  const card = branding.membershipCard ?? {
    image: null,
    tone: "neutral" as const,
    imageFit: "contain" as const,
  };
  const updateCard = (change: Partial<typeof card>) =>
    onChange({ ...value, branding: { ...branding, membershipCard: { ...card, ...change } } });
  return (
    <section className="space-y-5 rounded-lg border border-border p-4">
      <h2>{t("customer_card_design")}</h2>
      <p className="text-sm text-muted-foreground">{t("customer_card_design_hint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-2">
          {t("customer_card_tone")}
          <NativeSelect
            value={card.tone}
            disabled={disabled}
            onChange={(event) => {
              const tone = (["neutral", "green", "amber", "violet"] as const).find(
                (candidate) => candidate === event.target.value,
              );
              if (tone) updateCard({ tone });
            }}
          >
            {(["neutral", "green", "amber", "violet"] as const).map((tone) => (
              <option key={tone} value={tone}>
                {t(`customer_card_tone_${tone}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-2">
          {t("customer_card_fit")}
          <NativeSelect
            value={card.imageFit}
            disabled={disabled}
            onChange={(event) =>
              updateCard({ imageFit: event.target.value === "cover" ? "cover" : "contain" })
            }
          >
            <option value="contain">{t("customer_card_contain")}</option>
            <option value="cover">{t("customer_card_cover")}</option>
          </NativeSelect>
        </label>
      </div>
      <ThemeImageEditor
        storeId={storeId}
        value={card.image ?? null}
        disabled={disabled}
        onStagedChange={onStagedChange}
        onChange={(image) => updateCard({ image })}
      />
      <MembershipCard
        storeId={storeId}
        storeName={value.storeName ?? t("customer_card_preview")}
        memberName={t("customer_card_preview_member")}
        joinedAt={1782903600000}
        imageBasePath={`/api/admin/stores/${encodeURIComponent(storeId)}`}
        branding={{ ...branding, membershipCard: card }}
      />
      <div className="space-y-3 border-t border-border pt-5">
        <h3>{t("customer_member_icon")}</h3>
        <p className="text-sm text-muted-foreground">{t("customer_member_icon_hint")}</p>
        <ThemeImageEditor
          storeId={storeId}
          value={branding.memberIcon ?? null}
          disabled={disabled}
          onStagedChange={onStagedChange}
          onChange={(memberIcon) => onChange({ ...value, branding: { ...branding, memberIcon } })}
        />
      </div>
    </section>
  );
}
