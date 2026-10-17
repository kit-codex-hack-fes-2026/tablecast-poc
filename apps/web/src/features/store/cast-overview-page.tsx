import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileCheck2, Pencil } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { DraftStatus } from "../shell/configuration-status";
import { CastOverview } from "./cast-overview";
import { StartConfigurationEditing } from "./configuration-workflow";
import { emptyMenuListSearch, type CastTarget } from "./menu-model";
import { catalogOptions, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";

export function CastOverviewPage({ draftId }: { draftId?: string }) {
  const { id: storeId, role } = useStore();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const catalog = useQuery({ ...catalogOptions(storeId), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    queryFn: draftId ? draftOptions(storeId, draftId).queryFn : skipToken,
  });
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  const editable = !draftId || draft.data?.status === "draft" || draft.data?.status === "ready";
  const manager = role === "owner" || role === "admin";
  function editAction(target: CastTarget) {
    const language = t(target.endsWith("ja") ? "common_ja" : "common_en");
    const label =
      target === "proactive"
        ? t("cast_edit_proactive")
        : target.startsWith("instructions")
          ? m.cast_edit_instructions({ language }, { locale })
          : m.cast_edit_voice({ language }, { locale });
    return draftId ? (
      <Button
        nativeButton={false}
        role="link"
        variant="outline"
        render={
          <Link
            to="/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId"
            params={{ storeId, draftId, section: "cast", itemId: "settings" }}
            search={emptyMenuListSearch}
            hash={target}
          />
        }
      >
        <Pencil />
        {label}
      </Button>
    ) : (
      <StartConfigurationEditing
        key={`${storeId}:${target}`}
        section="cast"
        itemId="settings"
        label={label}
        onSelect={(nextDraftId) =>
          void navigate({
            to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
            params: { storeId, draftId: nextDraftId, section: "cast", itemId: "settings" },
            search: emptyMenuListSearch,
            hash: target,
          })
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {t("editor_cast")}
          {draft.data && <DraftStatus status={draft.data.status} />}
        </h1>
        {draftId && (
          <Button
            nativeButton={false}
            role="link"
            variant="outline"
            render={
              <Link
                to="/admin/stores/$storeId/menu/changes/$draftId"
                params={{ storeId, draftId }}
                search={{ ...emptyMenuListSearch, returnSection: "cast" }}
              />
            }
          >
            <FileCheck2 />
            {t("workflow_review")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("cast_overview_note")}</p>
      <ErrorNotice
        error={catalog.error || draft.error}
        onRetry={() => void (draftId ? draft.refetch() : catalog.refetch())}
      />
      {configuration ? (
        <CastOverview
          key={`${storeId}:${draftId ?? "published"}`}
          storeId={storeId}
          value={configuration.cast}
          renderEdit={manager && editable ? editAction : undefined}
        />
      ) : (
        !(catalog.error || draft.error) && <LoadingState />
      )}
    </div>
  );
}
