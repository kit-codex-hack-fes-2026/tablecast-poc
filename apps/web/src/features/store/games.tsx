import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ShieldOff } from "lucide-react";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { GameFrame } from "../../components/game-frame";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { gamesOptions, gameOptions } from "./game-query";
import { useStore } from "./store-shell";

const emptyState = {};
export function Games() {
  const { id: storeId } = useStore();
  const { t } = useI18n();
  const [after, setAfter] = useState("");
  const [selected, setSelected] = useState<string>();
  const games = useSuspenseQuery(gamesOptions(storeId, after));
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("games_title")}</h1>
        <p className="text-muted-foreground">{t("games_intro")}</p>
        <Link className="underline" to="/account/integrations/manual">
          {t("games_connect")}
        </Link>
      </header>
      <ErrorNotice error={games.error} onRetry={() => void games.refetch()} />
      {games.data.games.length === 0 && <p>{t("games_empty")}</p>}
      <div className="flex flex-wrap gap-2">
        {games.data.games.map((game) => (
          <Button
            key={game.id}
            variant={selected === game.id ? "default" : "outline"}
            onClick={() => setSelected(game.id)}
          >
            {game.id}
          </Button>
        ))}
      </div>
      {selected && <GameDetails key={selected} storeId={storeId} gameId={selected} />}
      <div className="flex gap-3">
        {after && (
          <Button variant="outline" onClick={() => setAfter("")}>
            {t("common_back")}
          </Button>
        )}
        {games.data.next && (
          <Button variant="outline" onClick={() => setAfter(games.data.next ?? "")}>
            {t("games_next")}
          </Button>
        )}
      </div>
    </section>
  );
}

function GameDetails({ storeId, gameId }: { storeId: string; gameId: string }) {
  const { t, locale } = useI18n();
  const { role } = useStore();
  const manager = ["owner", "admin"].includes(role);
  const client = useQueryClient();
  const game = useQuery(gameOptions(storeId, gameId));
  const [previewVersion, setPreviewVersion] = useState<string>();
  const [previewReady, setPreviewReady] = useState(false);
  const endpoint = rpc.api.admin.stores[":storeId"].games[":gameId"];
  const param = { storeId, gameId };
  const refresh = () => client.invalidateQueries({ queryKey: ["tablecast-game", storeId, gameId] });
  const validate = useMutation({
    mutationFn: (versionId: string) =>
      parseResponse(
        endpoint.versions[":versionId"].validate.$post({ param: { ...param, versionId } }),
      ),
    onSuccess: refresh,
  });
  const previewQuery = useQuery({
    queryKey: ["tablecast-game-preview", storeId, gameId, previewVersion],
    enabled: !!previewVersion,
    queryFn: ({ signal }) => {
      if (!previewVersion) throw new Error("GAME_NOT_FOUND");
      return parseResponse(
        rpc.api.admin.stores[":storeId"].games[":gameId"].versions[":versionId"].preview.$get(
          { param: { storeId, gameId, versionId: previewVersion } },
          { init: { signal } },
        ),
      );
    },
  });
  const preview = previewVersion ? previewQuery.data : undefined;
  const confirmPreview = useMutation({
    mutationFn: (versionId: string) =>
      parseResponse(
        endpoint.versions[":versionId"].previewed.$post({ param: { ...param, versionId } }),
      ),
    onSuccess: async () => {
      setPreviewVersion(undefined);
      await refresh();
    },
  });
  const publish = useMutation({
    mutationFn: (versionId: string) =>
      parseResponse(
        endpoint.publish.$post({
          param,
          json: { versionId, expectedRevision: game.data?.revision ?? 0, approved: true },
        }),
      ),
    onSuccess: refresh,
  });
  const disable = useMutation({
    mutationFn: () =>
      parseResponse(
        endpoint.disable.$post({ param, json: { expectedRevision: game.data?.revision ?? 0 } }),
      ),
    onSuccess: refresh,
  });
  const pending =
    validate.isPending ||
    previewQuery.isFetching ||
    publish.isPending ||
    disable.isPending ||
    confirmPreview.isPending;
  if (!game.data)
    return game.isPending ? (
      <p role="status">{t("common_loading")}</p>
    ) : (
      <ErrorNotice error={game.error} onRetry={() => void refresh()} />
    );
  return (
    <article className="space-y-4 rounded-xl border border-border bg-white p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {game.data.versions[0]?.manifest.name[locale] ?? gameId}
        </h2>
        <Badge>{t(game.data.activeVersionId ? "games_published" : "games_unpublished")}</Badge>
        {manager && game.data.activeVersionId && (
          <ConfirmAction
            label={t("games_disable")}
            subject={t("games_disable_note")}
            disabled={pending}
            icon={<ShieldOff />}
            onConfirm={() => disable.mutate()}
          />
        )}
      </header>
      <ErrorNotice
        error={
          game.error ||
          validate.error ||
          previewQuery.error ||
          confirmPreview.error ||
          publish.error ||
          disable.error
        }
        onRetry={() => void refresh()}
      />
      {preview && (
        <div className="space-y-4">
          <div className="h-[65dvh] min-h-96">
            <GameFrame
              key={`${preview.versionId}-${locale}`}
              game={preview.package}
              parentOrigin={preview.parentOrigin}
              locale={locale}
              players={preview.package.manifest.minPlayers}
              initialState={emptyState}
              preview
              onSave={() => Promise.resolve()}
              onExit={() => setPreviewVersion(undefined)}
              onReady={() => setPreviewReady(true)}
            />
          </div>
          <Button
            disabled={!previewReady || pending}
            onClick={() => confirmPreview.mutate(preview.versionId)}
          >
            {t("games_preview_confirm")}
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border">
        {game.data.versions.map((version) => (
          <li key={version.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all text-sm">{version.id}</code>
              {version.id === game.data.activeVersionId && (
                <Badge variant="success">{t("games_published")}</Badge>
              )}
              <Badge>{t(version.status === "ready" ? "games_validated" : "games_draft")}</Badge>
            </div>
            <p>{version.manifest.description[locale]}</p>
            <details>
              <summary className="cursor-pointer">{t("games_rules")}</summary>
              <p className="mt-2 whitespace-pre-wrap">{version.manifest.rules[locale]}</p>
            </details>
            {manager && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={pending || version.status === "ready"}
                  onClick={() => validate.mutate(version.id)}
                >
                  {t("admin_validate")}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || version.status !== "ready"}
                  onClick={() => {
                    setPreviewReady(false);
                    setPreviewVersion(version.id);
                  }}
                >
                  {t("games_preview")}
                </Button>
                <ConfirmAction
                  label={t(version.published ? "games_restore" : "games_publish")}
                  subject={version.manifest.name[locale]}
                  icon={<Check />}
                  disabled={
                    pending || !version.previewed || game.data.activeVersionId === version.id
                  }
                  onConfirm={() => publish.mutate(version.id)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {game.data.hasOlderVersions && <p>{t("games_older_versions")}</p>}
    </article>
  );
}
