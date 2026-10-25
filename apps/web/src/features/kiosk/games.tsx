import type { GameState, Locale } from "@tablecast/api/schema";
import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gamepad2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "tailwind-variants";
import { ErrorNotice } from "../../components/error-notice";
import { GameFrame } from "../../components/game-frame";
import { Button } from "../../components/ui/button";
import { surfaceMotion } from "../../components/ui/motion-variants";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";
import { m } from "../../paraglide/messages.js";
import { tableQueryKey } from "./table-query";

const startGame = (endpoint: TableEndpoint, gameId: string) =>
  parseResponse(endpoint.client.games[":gameId"].start.$post({ param: { gameId } }));
type Run = Awaited<ReturnType<typeof startGame>>;

export function KioskGames({
  endpoint,
  locale,
  players,
  stopVoice,
}: {
  endpoint: TableEndpoint;
  locale: Locale;
  players: number;
  stopVoice: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [after, setAfter] = useState("");
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<Run>();
  const opening = useRef(0);
  const client = useQueryClient();
  const runId = run?.id;
  const games = useQuery({
    queryKey: ["tablecast-table-games", endpoint.key, after],
    enabled: open,
    queryFn: ({ signal }) =>
      parseResponse(endpoint.client.games.$get({ query: { after } }, { init: { signal } })),
    refetchInterval: open ? 5000 : false,
  });
  const current = useQuery({
    queryKey: ["tablecast-game-run", endpoint.key, runId],
    enabled: open && !!runId,
    queryFn: ({ signal }) => {
      if (!runId) throw new Error("GAME_UNAVAILABLE");
      return parseResponse(
        endpoint.client.games.runs[":runId"].$get({ param: { runId } }, { init: { signal } }),
      );
    },
    refetchInterval: run ? 5000 : false,
    retry: false,
  });
  const enter = useMutation({
    mutationFn: stopVoice,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: tableQueryKey(endpoint) });
      opening.current += 1;
      setOpen(true);
    },
  });
  const start = useMutation({
    mutationFn: async (gameId: string) => startGame(endpoint, gameId),
    onMutate: () => opening.current,
    onSuccess: (value, _gameId, startedOpening) => {
      if (startedOpening !== opening.current) {
        end.mutate(value.id);
        return;
      }
      client.setQueryData(["tablecast-game-run", endpoint.key, value.id], {
        id: value.id,
        versionId: value.versionId,
        manifest: value.package.manifest,
        state: value.state,
        revision: value.revision,
      });
      setRun(value);
    },
  });
  const end = useMutation({
    mutationFn: (endedId: string) =>
      parseResponse(endpoint.client.games.runs[":runId"].end.$post({ param: { runId: endedId } })),
    onSuccess: (_value, endedId) =>
      client.removeQueries({ queryKey: ["tablecast-game-run", endpoint.key, endedId] }),
  });
  const close = () => {
    opening.current += 1;
    if (run) end.mutate(run.id);
    setRun(undefined);
    setOpen(false);
  };
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <ErrorNotice error={enter.error || end.error} />
        <Button
          className="h-auto min-h-11 whitespace-normal px-3 py-2"
          variant="ghost"
          disabled={enter.isPending}
          onClick={() => enter.mutate()}
        >
          <Gamepad2 />
          <span className="max-sm:sr-only">{t("games_title")}</span>
        </Button>
      </div>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop
            className={cn("fixed inset-0 z-40 bg-overlay", surfaceMotion({ kind: "backdrop" }))}
          />
          <Dialog.Popup
            render={(renderProps, state) => (
              <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            className={cn(
              "fixed inset-3 z-50 flex flex-col gap-4 overflow-y-auto rounded-2xl bg-background p-5 shadow-xl",
              surfaceMotion({ kind: "dialog" }),
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="text-xl font-semibold">{t("games_title")}</Dialog.Title>
              <Button variant="outline" onClick={close}>
                {t("games_return")}
              </Button>
            </div>
            <Dialog.Description className="text-muted-foreground">
              {t("games_guest_note")}
            </Dialog.Description>
            <ErrorNotice
              error={games.error || start.error || current.error}
              onRetry={() => void games.refetch()}
            />
            {run ? (
              current.error ? (
                <p role="alert">{t("games_unavailable")}</p>
              ) : (
                <div className="min-h-96 flex-1">
                  {current.data && (
                    <PlayingGame
                      key={run.id}
                      run={run}
                      endpoint={endpoint}
                      locale={locale}
                      snapshot={current.data}
                      onExit={close}
                    />
                  )}
                </div>
              )
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {games.isPending && <p role="status">{t("common_loading")}</p>}
                {games.data?.games.length === 0 && <p>{t("games_empty")}</p>}
                {games.data?.games.map((game) => (
                  <article
                    key={game.id}
                    className="space-y-3 rounded-xl border border-border bg-card p-5"
                  >
                    <h2 className="text-xl font-semibold">{game.manifest.name[locale]}</h2>
                    <p>{game.manifest.description[locale]}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {game.manifest.rules[locale]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {m.games_players(
                        {
                          min: game.manifest.minPlayers,
                          max: game.manifest.maxPlayers,
                          current: players,
                        },
                        { locale },
                      )}
                    </p>
                    <Button
                      className="h-auto min-h-14 whitespace-normal py-2"
                      disabled={
                        start.isPending ||
                        players < game.manifest.minPlayers ||
                        players > game.manifest.maxPlayers
                      }
                      onClick={() => start.mutate(game.id)}
                    >
                      {t("games_start")}
                    </Button>
                  </article>
                ))}
                <div className="flex gap-3 md:col-span-2">
                  {after && (
                    <Button variant="outline" onClick={() => setAfter("")}>
                      {t("common_back")}
                    </Button>
                  )}
                  {games.data?.next && (
                    <Button variant="outline" onClick={() => setAfter(games.data?.next ?? "")}>
                      {t("games_next")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function PlayingGame({
  run,
  endpoint,
  locale,
  snapshot,
  onExit,
}: {
  endpoint: TableEndpoint;
  locale: Locale;
  onExit: () => void;
  run: Run;
  snapshot: { revision: number; state: GameState };
}) {
  // poll中はframeを作り直さず、通信復旧で再mountした時だけ最新snapshotを採用する。
  const [initialState] = useState(snapshot.state);
  const revision = useRef(snapshot.revision);
  return (
    <GameFrame
      game={run.package}
      parentOrigin={run.parentOrigin}
      locale={locale}
      players={run.players}
      initialState={initialState}
      onExit={onExit}
      onSave={async (state) => {
        const saved = await parseResponse(
          endpoint.client.games.runs[":runId"].state.$put({
            param: { runId: run.id },
            json: { expectedVersion: revision.current, state },
          }),
        );
        revision.current = saved.revision;
      }}
    />
  );
}
