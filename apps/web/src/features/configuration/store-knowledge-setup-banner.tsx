import { Check, Copy, Plug } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export function KnowledgeSetupBanner({ storeId, draftId }: { draftId?: string; storeId: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"copied" | "error" | "idle">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${t("knowledge_setup_request")}\n${t("knowledge_setup_store")}: ${storeId}${draftId ? `\n${t("knowledge_setup_draft")}: ${draftId}` : ""}`,
      );
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <aside
      aria-label={t("knowledge_setup_title")}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-subtle px-4 py-3"
    >
      <Plug aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold">{t("knowledge_setup_title")}</p>
        <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
          {t("knowledge_setup_hint")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          nativeButton={false}
          role="link"
          size="sm"
          render={
            <a href="/account/integrations/plugins" aria-label={t("knowledge_setup_connect")} />
          }
        >
          <Plug />
          {t("knowledge_setup_connect")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {status === "copied" ? <Check /> : <Copy />}
          {t("knowledge_setup_copy")}
        </Button>
      </div>
      {status !== "idle" && (
        <p
          role={status === "error" ? "alert" : "status"}
          className={`w-full text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {t(status === "copied" ? "common_copied" : "common_copy_failed")}
        </p>
      )}
    </aside>
  );
}
