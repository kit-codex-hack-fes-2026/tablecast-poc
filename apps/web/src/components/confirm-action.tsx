import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/locale";

import { Button } from "./ui/button";

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
  label: string;
  subject: string;
  disabled?: boolean;
  onConfirm: () => void;
  icon: ReactNode;
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
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-overlay" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <AlertDialog.Popup className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-lg">
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
