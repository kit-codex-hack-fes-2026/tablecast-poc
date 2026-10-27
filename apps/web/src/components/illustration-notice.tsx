import { Paintbrush } from "lucide-react";
import { useI18n } from "../i18n/locale";

/** 写真と区別する注記を画像上の同じ位置に置く。 */
export function IllustrationNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      data-ui="illustration-label"
      title={t("kiosk_illustration")}
      className={`pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] rounded bg-card/90 text-[10px] leading-none font-medium text-foreground ${compact ? "p-0.5" : "px-1 py-0.5"}`}
    >
      {compact && <Paintbrush aria-hidden className="size-2.5" />}
      <span className={compact ? "sr-only" : undefined}>{t("kiosk_illustration")}</span>
    </span>
  );
}
