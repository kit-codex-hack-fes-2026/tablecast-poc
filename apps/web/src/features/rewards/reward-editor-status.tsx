import { uiLocale } from "@tablecast/api/localization";
import { Undo2 } from "lucide-react";
import { ConfirmAction } from "../../components/confirm-action";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";

export function RewardEditorStatus({
  version,
  conflict,
  pending,
  onReload,
}: {
  conflict: boolean;
  onReload: () => void;
  pending: boolean;
  version: number;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {m.reward_editor_version({ version }, { locale: uiLocale(locale) })}
      </p>
      {conflict && (
        <p role="status" className="rounded-lg border border-border bg-muted p-4">
          {t("reward_editor_conflict")}
        </p>
      )}
      <ConfirmAction
        label={t("reward_editor_reload")}
        subject={t("reward_editor_reload_note")}
        disabled={pending}
        icon={<Undo2 />}
        onConfirm={onReload}
      />
    </div>
  );
}
