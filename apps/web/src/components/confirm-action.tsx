import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";

export function ConfirmAction({
  label,
  subject,
  disabled,
  onConfirm,
  icon,
}: {
  label: string;
  subject: string;
  disabled?: boolean;
  onConfirm: () => void;
  icon: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger render={<Button variant="destructive" />} disabled={disabled}>
        {icon}
        {label}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/30" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <AlertDialog.Popup className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-white p-6 shadow-lg">
            <AlertDialog.Title className="text-xl font-semibold">{label}</AlertDialog.Title>
            <AlertDialog.Description className="break-words text-base">
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
