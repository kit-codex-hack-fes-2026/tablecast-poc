import type { GamePackage } from "@tablecast/api/schema";

// CSPを生成コードより先に適用し、実行コードを本体のJavaScript環境へ評価しない。
export function gameDocument(game: GamePackage, parentOrigin: string) {
  const payload = JSON.stringify({ game, parentOrigin }).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<script>
(() => {
  const {game, parentOrigin} = ${payload};
  const requests = new Map();
  let initialise;
  const ready = new Promise(resolve => { initialise = resolve; });
  const send = value => parent.postMessage(value, parentOrigin);
  globalThis.tablecast = Object.freeze({
    ready,
    exit() { send({type: "tablecast.game.exit"}); },
    save(state) {
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { requests.delete(requestId); reject(new Error("GAME_SAVE_TIMEOUT")); }, 10000);
        requests.set(requestId, {resolve, reject, timer});
        send({type: "tablecast.game.save", requestId, state});
      });
    }
  });
  addEventListener("message", event => {
    if (event.source !== parent || event.origin !== parentOrigin) return;
    const message = event.data;
    if (message?.type === "tablecast.game.init") { document.documentElement.lang = message.context.locale; initialise(message.context); }
    if (message?.type === "tablecast.game.saved") {
      const pending = requests.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer); requests.delete(message.requestId);
      if (message.ok) pending.resolve(); else pending.reject(new Error("GAME_SAVE_FAILED"));
    }
  });
  const style = document.createElement("style"); style.textContent = game.css; document.head.append(style);
  const root = document.createElement("main"); root.innerHTML = game.html; document.body.append(root);
  const script = document.createElement("script"); script.textContent = game.javascript; document.body.append(script);
  send({type: "tablecast.game.ready", protocol: 1});
})();
</script></body></html>`;
}
