import { useI18n } from "../i18n/locale";

/** 写真と区別する注記を画像上の同じ位置に置く。 */
export function IllustrationNotice() {
  const { t } = useI18n();
  return (
    <span
      data-ui="illustration-label"
      className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] rounded bg-card/90 px-1.5 py-1 text-xs leading-tight font-medium text-foreground"
    >
      {t("kiosk_illustration")}
    </span>
  );
}
