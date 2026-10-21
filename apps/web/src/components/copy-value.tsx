import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";

/**
 * 設定値等をコピーする。
 * labelは名前、valueは文字列。
 * 読み取り専用textareaから手動選択もでき、成功・失敗をstatusで伝える。
 * 秘密を固定Storyへ埋め込まない。
 * Clipboard APIが使える安全なcontextで使用する。
 */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"copied" | "error" | "idle">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${label}: ${t("common_copy")}`}
          onClick={() => void copy()}
        >
          <span key={status} className="inline-flex motion-safe:animate-tablecast-confirm">
            {status === "copied" ? <Check /> : <Copy />}
          </span>
        </Button>
      </div>
      <textarea
        readOnly
        wrap="off"
        rows={value.split("\n").length}
        value={value}
        aria-label={label}
        className="block w-full resize-none rounded-lg border border-border bg-secondary/50 p-3 font-mono text-sm leading-relaxed"
      />
      <span role="status" className="block min-h-5 text-sm">
        <span key={status} className="block motion-safe:animate-tablecast-state">
          {status === "error"
            ? t("common_copy_failed")
            : status === "copied"
              ? t("common_copied")
              : null}
        </span>
      </span>
    </div>
  );
}
