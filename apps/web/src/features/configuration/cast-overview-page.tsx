import { uiLocale } from "@tablecast/api/localization";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileCheck2, Pencil } from "lucide-react";
import { useMemo } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { ImageProvider } from "../../components/image-provider";
import { LoadingState } from "../../components/loading-state";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { catalogOptions } from "../catalog/catalog-query";
import { useStore } from "../store/store-context";
import { CastOverview } from "./cast-overview";
import { ConfigurationToolbar } from "./configuration-toolbar";
import { StartConfigurationEditing } from "./configuration-workflow";
import { type CastTarget, emptyMenuListSearch } from "./menu-model";
import { draftOptions } from "./menu-query";

export function CastOverviewPage({ draftId }: { draftId?: string }) {
  const { id: storeId, role } = useStore();
  const { t } = useI18n();
  const catalog = useQuery({ ...catalogOptions(storeId), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    queryFn: draftId ? draftOptions(storeId, draftId).queryFn : skipToken,
  });
  const configurationData = draftId ? draft.data : catalog.data;
  const configuration = configurationData?.configuration;
  const editable = !draftId || ["draft", "ready"].includes(draft.data?.status ?? "");
  const manager = ["owner", "admin"].includes(role);

  return (
    <div className="space-y-6">
      <PageHeader title={t("editor_cast")} />
      {draftId && (
        <ConfigurationToolbar>
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
        </ConfigurationToolbar>
      )}
      <ErrorNotice
        error={catalog.error || draft.error}
        onRetry={() => void (draftId ? draft.refetch() : catalog.refetch())}
      />
      {configuration ? (
        <ImageProvider
          basePath={`/api/admin/stores/${storeId}`}
          assets={configurationData?.imageAssets}
        >
          <CastOverview
            key={`${storeId}:${draftId ?? "published"}`}
            storeId={storeId}
            value={configuration.cast}
            renderEdit={
              manager && editable
                ? (target) => <CastEditAction target={target} storeId={storeId} draftId={draftId} />
                : undefined
            }
          />
        </ImageProvider>
      ) : (
        !(catalog.error || draft.error) && <LoadingState />
      )}
    </div>
  );
}

function CastEditAction({
  target,
  storeId,
  draftId,
}: {
  draftId?: string;
  storeId: string;
  target: CastTarget;
}) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const languageNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: "language" }),
    [locale],
  );
  const language =
    target === "proactive" || target === "knowledge"
      ? ""
      : (languageNames.of(target.slice(target.indexOf("-") + 1)) ?? target);
  function editLabel() {
    if (target === "knowledge") return t("knowledge_edit");
    if (target === "proactive") return t("cast_edit_proactive");
    if (target.startsWith("system")) return `${t("cast_edit_system")} (${language})`;
    if (target.startsWith("instructions"))
      return m.cast_edit_instructions({ language }, { locale: uiLocale(locale) });
    if (target.startsWith("opening")) return `${t("cast_edit_opening")} (${language})`;
    return m.cast_edit_voice({ language }, { locale: uiLocale(locale) });
  }
  const label = editLabel();
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
