import type { ConfigurationHistoryEntry } from "@tablecast/api/schema";
import { Link } from "@tanstack/react-router";
import { Circle, CornerDownRight, ChevronRight } from "lucide-react";
import { DateTime } from "../../components/date-time";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { DraftStatus } from "../shell/configuration-status";

/** 公開版の流れと保存済み下書きの由来。線は装飾に限定し、関係は本文でも示す。 */
export function ConfigurationTimeline({
  entries,
  publishedVersion,
  storeId,
  onSelect,
}: {
  entries: ConfigurationHistoryEntry[];
  publishedVersion: number;
  storeId: string;
  onSelect: (version: number, trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <ol
      className="relative max-w-4xl space-y-5 before:absolute before:inset-y-3 before:left-3 before:w-px before:bg-border"
      aria-label={t("configuration_history_title")}
    >
      {entries.map((entry) => (
        <li key={`${entry.kind}/${entry.id}`} className="relative pl-10">
          <span
            aria-hidden="true"
            className="absolute top-5 left-0 flex size-6 items-center justify-center bg-background"
          >
            {entry.kind === "release" ? (
              <Circle className="size-4 fill-background" />
            ) : (
              <CornerDownRight className="size-5 text-muted-foreground" />
            )}
          </span>
          <div
            className={`space-y-3 rounded-xl border border-border p-4 sm:p-5 ${entry.kind === "draft" ? "sm:ml-6" : "bg-card"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              {entry.kind === "release" ? (
                <Button
                  variant="link"
                  className="text-base"
                  onClick={(event) => onSelect(entry.version, event.currentTarget)}
                >
                  {m.configuration_history_release({ version: entry.version }, { locale })}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              ) : (
                <Button
                  nativeButton={false}
                  role="link"
                  variant="link"
                  className="text-base"
                  render={
                    <Link
                      to="/admin/stores/$storeId/menu/changes/$draftId"
                      params={{ storeId, draftId: entry.id }}
                    />
                  }
                >
                  {m.workflow_draft_identity({ id: entry.id.slice(0, 8) }, { locale })}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              )}
              {entry.kind === "release" ? (
                <Badge variant={entry.version === publishedVersion ? "success" : "inactive"}>
                  {t(
                    entry.version === publishedVersion
                      ? "configuration_history_current"
                      : "configuration_history_previous",
                  )}
                </Badge>
              ) : (
                <DraftStatus status={entry.status} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <DateTime value={entry.at} />
              <span>
                {t(
                  entry.kind === "release"
                    ? "configuration_history_publisher"
                    : "configuration_history_creator",
                )}
                : {entry.actorName ?? t("configuration_history_unknown")}
              </span>
            </div>
            {entry.baseVersion !== null && (
              <p className="text-sm">
                {m.configuration_history_base({ version: entry.baseVersion }, { locale })}
              </p>
            )}
            {entry.restoredFromVersion !== null && (
              <p className="text-sm">
                {m.configuration_history_restored(
                  { version: entry.restoredFromVersion },
                  { locale },
                )}
              </p>
            )}
            {entry.sourceDraftId && (
              <Link
                className="text-sm underline underline-offset-4"
                to="/admin/stores/$storeId/menu/changes/$draftId"
                params={{ storeId, draftId: entry.sourceDraftId }}
              >
                {t("configuration_history_source")}
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
