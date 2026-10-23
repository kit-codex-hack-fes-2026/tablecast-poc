import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { gamePackageSchema, registerGameSchema } from "../games/model";
import { getGame, getGameVersion, listGames, readGamePackage } from "../games/queries";
import { registerGame, validateGame } from "../games/use-cases/publication";
import { result } from "./result";
export function registerGamesTools(server: McpServer, services: ApiServices, actor: Actor) {
  server.registerTool(
    "get_game_spec",
    {
      description: "卓上ゲーム制作のパッケージ仕様と実行APIを取得する。制作前に必ず読む。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      result({
        schema: z.toJSONSchema(gamePackageSchema),
        protocol: 1,
        instructions: [
          "HTMLはbody内のマークアップ、CSS、バンドル済みJavaScriptを分ける。画像・音声・3Dモデルはdata URLなどで同梱し、CDN・fetch・外部importを使わない。合計2MBまで。",
          "const context = await tablecast.ready; でlocale(ja/en)、players、state、previewを受け取る。生成コードへ認証情報・注文API・店舗IDは渡さない。",
          "manifest.capabilitiesにstateを宣言した場合だけawait tablecast.save(state)で16KiB以下のJSONを保存できる。tablecast.exit()で終了する。",
          "sandboxのopaque originで動作し、親DOM・Cookie・localStorage・マイク・外部通信・eval・Workerは使えない。音声AI APIはapiVersion 1では提供しない。",
          "参加人数内で開始・順番交代・結果発表まで遊べるようにする。日英表示、スキップ、ソフトドリンク参加、iPadのタッチ操作とreduced motionに対応する。客向けの自由文入力欄は作らない。",
          "register_gameは毎回変更不可の新しい版を作る。validate_game後、reviewUrlで人が試遊して承認する。MCPは公開できない。修正は再登録する。",
        ],
        example: {
          html: '<button id="finish"></button>',
          css: "button { min-height: 48px; }",
          javascript:
            'tablecast.ready.then(({locale}) => { const b = document.getElementById("finish"); b.textContent = locale === "ja" ? "終了" : "Finish"; b.onclick = () => tablecast.exit(); });',
        },
      }),
  );

  server.registerTool(
    "list_games",
    {
      description: "店舗のゲームと公開版を最大50件取得する。nextがあればafterに渡す。",
      inputSchema: { after: z.string().max(60).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ after }) => result(await listGames(services, actor, after)),
  );

  server.registerTool(
    "get_game",
    {
      description:
        "ゲームの版と状態を20件ずつ取得する。nextBeforeがあればbeforeへ渡す。版のソースはget_game_sourceで取得する。",
      inputSchema: { gameId: z.string().max(60), before: z.uuid().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ gameId, before }) => result(await getGame(services, actor, gameId, before)),
  );

  server.registerTool(
    "get_game_source",
    {
      description: "指定版の制作ソースを取得する。",
      inputSchema: { gameId: z.string().max(60), versionId: z.uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ gameId, versionId }) => {
      const version = await getGameVersion(services, actor, gameId, versionId);
      return result({
        versionId,
        package: await readGamePackage(services, version.package_key),
      });
    },
  );

  server.registerTool(
    "register_game",
    {
      description: "店舗のゲームを変更不可の新しい下書き版として登録する。公開は変更しない。",
      inputSchema: registerGameSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) => result(await registerGame(services, actor, input)),
  );

  server.registerTool(
    "validate_game",
    {
      description:
        "ゲームの仕様・容量・権限を検証し、試遊と公開承認の管理画面を返す。ゲームの動作確認は管理画面で行う。",
      inputSchema: { gameId: z.string().max(60), versionId: z.uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ gameId, versionId }) => result(await validateGame(services, actor, gameId, versionId)),
  );
}
