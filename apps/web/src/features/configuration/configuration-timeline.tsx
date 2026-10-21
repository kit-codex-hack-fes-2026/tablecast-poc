import type { ConfigurationHistoryEntry } from "@tablecast/api/schema";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, CornerDownRight, FilePenLine } from "lucide-react";
import { DateTime } from "../../components/date-time";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { UserIdentity } from "../../components/user-identity";
import { dateTime } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { DraftStatus } from "./configuration-status";

/** 公開版の流れと保存済み下書きの由来。線は装飾に限定し、関係は本文でも示す。 */
export function ConfigurationTimeline({
  entries,
  publishedVersion,
  storeId,
  onSelect,
}: {
  entries: ConfigurationHistoryEntry[];
  onSelect: (version: number, trigger: HTMLButtonElement) => void;
  publishedVersion: number;
  storeId: string;
}) {
  const { t, locale } = useI18n();
  return (
    <ol
      className="relative max-w-4xl space-y-5 before:absolute before:inset-y-3 before:left-3 before:w-px before:bg-success/30"
      aria-label={t("configuration_history_title")}
    >
      {entries.map((entry) => {
        const historical =
          entry.kind === "release"
            ? entry.version !== publishedVersion
            : entry.status === "published" || entry.status === "discarded";
        return (
          <li key={`${entry.kind}/${entry.id}`} className="relative pl-10">
            <span
              aria-hidden="true"
              className="absolute top-5 left-0 flex size-6 items-center justify-center rounded-full bg-background"
            >
              {entry.kind === "release" ? (
                <Check
                  className={`size-5 rounded-full p-0.5 ${historical ? "bg-secondary text-muted-foreground" : "bg-success text-on-inverse"}`}
                />
              ) : (
                <CornerDownRight
                  className={`size-5 ${historical ? "text-muted-foreground" : "text-info"}`}
                />
              )}
            </span>
            <div
              className={`overflow-hidden rounded-xl border ${entry.kind === "draft" ? `border-dashed sm:ml-6 ${historical ? "border-border bg-card" : "border-info/40 bg-info-soft/40"}` : historical ? "border-border bg-card" : "border-success/25 bg-card"}`}
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${historical ? "border-border bg-secondary/40" : entry.kind === "release" ? "border-success/15 bg-success-soft/60" : "border-info/15 bg-info-soft"}`}
              >
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
                    aria-label={`${t("workflow_draft_identity")} · ${dateTime(entry.at, locale)}`}
                    variant="link"
                    className="text-base"
                    render={
                      <Link
                        to="/admin/stores/$storeId/menu/changes/$draftId"
                        params={{ storeId, draftId: entry.id }}
                      />
                    }
                  >
                    <FilePenLine aria-hidden="true" className="size-4" />
                    {t("workflow_draft_identity")}
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
              <div className="space-y-3 p-4 sm:p-5">
                <DateTime value={entry.at} />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      entry.kind === "release"
                        ? "configuration_history_publisher"
                        : "configuration_history_creator",
                    )}
                  </p>
                  <UserIdentity
                    compact
                    user={{
                      name: entry.actorName ?? t("identity_unknown"),
                      email: entry.actorEmail,
                      image: entry.actorImage,
                    }}
                  />
                </div>
                {entry.baseVersion !== null && (
                  <p className="text-sm text-muted-foreground">
                    {m.configuration_history_base({ version: entry.baseVersion }, { locale })}
                  </p>
                )}
                {entry.restoredFromVersion !== null && (
                  <p className="text-sm text-muted-foreground">
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
            </div>
          </li>
        );
      })}
    </ol>
  );
}
