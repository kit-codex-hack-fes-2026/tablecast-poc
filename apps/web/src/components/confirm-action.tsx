import type { ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";
import { surfaceMotion } from "./ui/motion-variants";

/**
 * 取り消せない操作の直前確認。
 * labelは具体的な動詞、subjectは対象と影響、iconは装飾、disabledは処理状態、onConfirmは確定時だけ実行する。
 * triggerClassNameは配置調整用。
 * 確認後の非同期結果・失敗・再試行は呼出し元のActionFeedbackで扱う。
 * 注文や公開の専用承認フローを置き換えない。
 */
export function ConfirmAction({
  label,
  subject,
  disabled,
  onConfirm,
  icon,
  triggerClassName,
  triggerLabel,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onConfirm: () => void;
  subject: string;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger
        render={<Button variant="destructive" className={triggerClassName} />}
        disabled={disabled}
        aria-label={label}
      >
        {icon}
        {triggerLabel ?? label}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          className={cn("fixed inset-0 z-40 bg-overlay", surfaceMotion({ kind: "backdrop" }))}
        />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 data-ending-style:pointer-events-none">
          <AlertDialog.Popup
            render={(renderProps, state) => (
              <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            className={cn(
              "w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-lg",
              surfaceMotion({ kind: "dialog" }),
            )}
          >
            <AlertDialog.Title className="text-xl font-semibold">{label}</AlertDialog.Title>
            <AlertDialog.Description className="wrap-break-word text-base">
              {subject}
            </AlertDialog.Description>
            <div className="flex justify-end gap-3">
              <AlertDialog.Close render={<Button variant="outline" />}>
                {t("common_cancel")}
              </AlertDialog.Close>
              <AlertDialog.Close render={<Button variant="destructive" />} onClick={onConfirm}>
                {icon}
                {label}
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
