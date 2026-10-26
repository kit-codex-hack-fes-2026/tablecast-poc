import { Globe, LoaderCircle, ScanLine, Sparkles } from "lucide-react";
import type { VoiceView } from "./voice-model";
import { useI18n } from "../../i18n/locale";

export function VoiceProgress({ view }: { view: VoiceView }) {
  const { t } = useI18n();
  const running = view.status === "thinking";
  const progress = view.progress;
  if (!running && !progress?.summary && !view.citations?.length) return null;
  const stage = progress?.stage ?? "thinking";
  const Icon = stage === "searching" ? Globe : stage === "reading" ? ScanLine : Sparkles;
  const label = t(
    stage === "searching"
      ? "kiosk_searching"
      : stage === "reading"
        ? "kiosk_camera_reading"
        : "kiosk_voice_thinking",
  );
  return (
    <div
      className="min-w-0 shrink-0 space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-xs"
      data-ui="voice-progress"
    >
      {running && (
        <div className="flex items-center gap-2" role="status">
          <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </div>
      )}
      {progress?.summary && (
        <details open={running || undefined}>
          <summary className="cursor-pointer font-medium">{t("kiosk_reasoning_summary")}</summary>
          <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap wrap-break-word leading-relaxed text-muted-foreground">
            {progress.summary}
          </p>
        </details>
      )}
      {Boolean(view.citations?.length) && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label={t("kiosk_sources")}>
          {view.citations?.map((citation) => (
            <li key={citation.url}>
              <a
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {citation.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
