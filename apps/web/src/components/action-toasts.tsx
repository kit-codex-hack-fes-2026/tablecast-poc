import { Toast } from "@base-ui/react/toast";
import { Check, X } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";

/** 操作成功を通知し、時間・フォーカス・読上げはBase UIへ任せる。 */
export function ActionToasts() {
  const { toasts } = Toast.useToastManager();
  const { t } = useI18n();
  return (
    <Toast.Viewport className="pointer-events-none absolute inset-x-3 top-3 z-50 flex flex-col items-end gap-2 outline-none">
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          className="pointer-events-auto w-full max-w-sm rounded-2xl border border-success-border bg-card p-2 text-foreground shadow-xl transition-[opacity,transform] duration-(--motion-state) ease-(--motion-ease-out) data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-limited:hidden motion-reduce:transform-none"
        >
          <Toast.Content className="flex items-center gap-3">
            <Check aria-hidden className="size-5 shrink-0 text-success" />
            <Toast.Title className="min-w-0 flex-1 text-sm font-medium" />
            <Toast.Close
              aria-label={t("common_close")}
              aria-hidden={false}
              render={<Button variant="outline" size="icon-sm" />}
            >
              <X aria-hidden />
            </Toast.Close>
          </Toast.Content>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}
