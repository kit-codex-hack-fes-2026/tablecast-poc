import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";

export function CopyValue({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
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
          {status === "copied" ? <Check /> : <Copy />}
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
        {status === "error"
          ? t("common_copy_failed")
          : status === "copied"
            ? t("common_copied")
            : null}
      </span>
    </div>
  );
}
