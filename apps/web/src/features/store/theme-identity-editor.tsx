import type { Appearance } from "@tablecast/api/schema";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
export function ThemeIdentityEditor({
  appearance,
  disabled,
  onChange,
}: {
  appearance: Appearance;
  disabled: boolean;
  onChange: (change: Partial<Appearance>) => void;
}) {
  const { t, locale } = useI18n();
  const header = appearance.header ?? { logoWidth: 144, logoHeight: 40, gap: 16 };
  const voice = appearance.voice ?? { mode: "orb" };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <fieldset className="space-y-4 rounded-xl border border-border p-4" disabled={disabled}>
        <legend className="px-1 font-semibold">{t("theme_header")}</legend>
        <p className="text-sm text-muted-foreground">{t("theme_header_hint")}</p>
        {(["logoWidth", "logoHeight", "gap"] as const).map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            {t(
              key === "logoWidth"
                ? "theme_logo_width"
                : key === "logoHeight"
                  ? "theme_logo_height"
                  : "theme_spacing",
            )}
            <Input
              type="number"
              min={key === "logoWidth" ? 64 : key === "logoHeight" ? 24 : 8}
              max={key === "logoWidth" ? 320 : key === "logoHeight" ? 64 : 24}
              value={Number.isFinite(header[key]) ? header[key] : ""}
              onChange={(event) =>
                onChange({ header: { ...header, [key]: event.target.valueAsNumber } })
              }
            />
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-4 rounded-xl border border-border p-4" disabled={disabled}>
        <legend className="px-1 font-semibold">{t("theme_voice_presence")}</legend>
        <p className="text-sm text-muted-foreground">{t("theme_voice_presence_hint")}</p>
        <label className="grid gap-1 text-sm">
          {t("theme_voice_style")}
          <NativeSelect
            value={voice.mode}
            onChange={(event) =>
              onChange({
                voice: {
                  ...voice,
                  mode:
                    event.target.value === "character"
                      ? "character"
                      : event.target.value === "face"
                        ? "face"
                        : "orb",
                },
              })
            }
          >
            <option value="orb">{t("theme_voice_orb")}</option>
            <option value="face">{t("theme_voice_face")}</option>
            <option value="character">{t("theme_voice_character")}</option>
          </NativeSelect>
        </label>
        {voice.mode === "character" && (
          <>
            <label className="grid gap-1 text-sm">
              {t("theme_voice_base")}
              <NativeSelect
                required
                value={voice.character ?? ""}
                onChange={(event) =>
                  onChange({ voice: { ...voice, character: event.target.value || undefined } })
                }
              >
                <option value="">{t("theme_select_asset")}</option>
                {Object.entries(appearance.assets ?? {}).map(([name, asset]) => (
                  <option key={name} value={name}>
                    {asset.alt[locale] || name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <details>
              <summary className="cursor-pointer py-2 text-sm">{t("theme_voice_states")}</summary>
              <div className="grid gap-3 pt-2">
                {(["idle", "listening", "thinking", "speaking", "error"] as const).map((state) => (
                  <label key={state} className="grid gap-1 text-sm">
                    {t(
                      state === "idle"
                        ? "kiosk_voice_paused"
                        : state === "listening"
                          ? "kiosk_voice_listening"
                          : state === "thinking"
                            ? "kiosk_voice_thinking"
                            : state === "speaking"
                              ? "kiosk_voice_speaking"
                              : "kiosk_voice_error",
                    )}
                    <NativeSelect
                      value={voice.states?.[state] ?? ""}
                      onChange={(event) => {
                        const states = { ...voice.states };
                        if (event.target.value) states[state] = event.target.value;
                        else delete states[state];
                        onChange({ voice: { ...voice, states } });
                      }}
                    >
                      <option value="">{t("theme_voice_base")}</option>
                      {Object.entries(appearance.assets ?? {}).map(([name, asset]) => (
                        <option key={name} value={name}>
                          {asset.alt[locale] || name}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ))}
              </div>
            </details>
          </>
        )}
      </fieldset>
    </div>
  );
}
