import {
  gameMessageSchema,
  type GamePackage,
  type GameState,
  type Locale,
} from "@tablecast/api/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/locale";
import { gameDocument } from "../lib/game-document";
import { Button } from "./ui/button";

export function GameFrame({
  game,
  parentOrigin,
  locale,
  players,
  initialState,
  preview = false,
  onSave,
  onExit,
  onReady,
}: {
  game: GamePackage;
  locale: Locale;
  players: number;
  initialState: GameState;
  preview?: boolean;
  parentOrigin: string;
  onSave: (state: GameState) => Promise<void>;
  onExit: () => void;
  onReady?: () => void;
}) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onSave, onExit, onReady });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const document = useMemo(() => gameDocument(game, parentOrigin), [game, parentOrigin]);
  useEffect(() => {
    callbacks.current = { onSave, onExit, onReady };
  }, [onSave, onExit, onReady]);
  useEffect(() => {
    let active = true;
    let saving = false;
    let connected = false;
    const timer = window.setTimeout(() => {
      if (!connected) setFailed(true);
    }, 10_000);
    function receive(event: MessageEvent<unknown>) {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target || event.origin !== "null") return;
      const parsed = gameMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === "tablecast.game.ready") {
        if (connected) return;
        connected = true;
        setReady(true);
        window.clearTimeout(timer);
        target.postMessage(
          {
            type: "tablecast.game.init",
            context: { locale, players, state: initialState, preview },
          },
          "*",
        );
        callbacks.current.onReady?.();
      } else if (message.type === "tablecast.game.exit") {
        callbacks.current.onExit();
      } else {
        const reply = (ok: boolean) => {
          if (active)
            target.postMessage(
              { type: "tablecast.game.saved", requestId: message.requestId, ok },
              "*",
            );
        };
        if (!connected || saving || !game.manifest.capabilities.includes("state")) {
          reply(false);
          return;
        }
        saving = true;
        void callbacks.current
          .onSave(message.state)
          .then(
            () => reply(true),
            () => reply(false),
          )
          .finally(() => {
            saving = false;
          });
      }
    }
    window.addEventListener("message", receive);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [game, locale, players, initialState, preview]);
  return (
    <section className="flex h-full min-h-96 flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{game.manifest.name[locale]}</h2>
        <Button variant="outline" onClick={onExit}>
          {t("games_exit")}
        </Button>
      </header>
      {failed ? (
        <p role="alert">{t("games_load_failed")}</p>
      ) : (
        <>
          {!ready && <p role="status">{t("common_loading")}</p>}
          {document && (
            <iframe
              ref={frame}
              title={game.manifest.name[locale]}
              srcDoc={document}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
              className="min-h-96 w-full flex-1 rounded-xl border border-border bg-white"
            />
          )}
        </>
      )}
    </section>
  );
}
