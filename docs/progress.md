# TableCast 実装・検証記録

更新: 2026-09-06

ユーザーの指定によりローカル実装を先行する。外部資格を使用する実音声、OAuth、ChatGPTからのMCP接続、公開環境、iPad実機試験は後続の受入とし、未実施を成功扱いにしない。

## 現在の段階

段階0–4のうち、外部資格なしで動かせるローカル経路を実装・検証した。実装の中間commitは `6c1fb66`。開始時は仕様文書と挨拶用の雛形のみだった。仕様の基準は `7da695b`、不要なClaude/Cursor指示の削除は `aff12ad`、生成した商品画像12点は `94d3352` に保存した。pushは行っていない。

指定されたrepo-local skillは実ファイルが存在しなかったため、同名のユーザー側 `minimum-impl` スキルを読み適用した。

## 基盤の決定

- Bun 1.3.13、Node 24.7以上、TypeScript 6.0.3。Cloudflare公式 `@cloudflare/vitest-plugin` 1.1.4とVitest 4.1.11を使用。
- 通常開発はCloudflare Vite Pluginの補助WorkerでAPIを起動し、Service BindingでWebと接続する。
- 開発資源と秘密情報はworktreeの `.local` に分離する。既存 `.env.local` を自動読込みして有料サービスへ接続しない。
- Web、API、Pythonを分担し、ルートlockfileとmigrationは統合担当が管理する。
- ユーザーの追加指定で、shadcn・Base UI・Tailwind・Lucide・Simple Flagsのデザインシステムを導入。装飾用の見出しや補助文を削除。
- デモは日本酒28種を含む各60商品・3店舗・2組織・36卓。商品画像は生成原本を保存し、R2からImages bindingで640px WebPとして配信する。
- 音声の外部前提がすべて揃った時だけローカルAPIの音声を有効化する。初期カタログのVoice IDは未設定。

## 実行結果

| 確認                          | 結果・証拠                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bun --no-env-file run check` | 全体format/lint/typecheck成功。ルート7件、Python66件、Web音声単体6件、API44件成功                                                         |
| 追加のAPI修正                 | 実workerd・D1・DOの49件成功。終了・再接続の回帰5件を含む。二重開始、停止済みturn、音声有効フラグ、公開後のカート修正を含む                |
| 更新後のUI部品                | Storybook20件、Web音声単体6件成功。日英・選択・エラー・アクセシビリティ                                                                   |
| ブラウザー                    | Chromium/WebKitの計4件で注文→受付→提供→模擬支払→閉卓、認証付きMCP事前登録→組織選択→同意→PKCEを検証。新居酒屋デモ・本番相当環境でも4件成功 |
| 実R2・Images                  | 日本酒PNGをHTTP200、640×640 WebP、36,858bytesで取得                                                                                       |
| デモの初期化                  | 新しい居酒屋データを実D1へ投入。3店舗36卓、初期注文15件、event102件、商品180件                                                            |
| history                       | 独立した実D1で600履歴セッション、総注文2,415件、2万超event。再seed件数不変、T01の操作状態保持、外部キー・店舗境界・残額0を検証            |
| 背景進行                      | `demo:play`で正規APIから12操作。T01とT12は進行対象から除外                                                                                |
| 固定patch                     | 公式pluginの隔離環境で13件成功。通常のPython試験とは別扱い                                                                                |
| Git hooks                     | Lefthookのpre-commitとpre-pushを導入済み。自動stageを行わない                                                                             |

3worktreeを同時起動し、24予約port、host、Cookie、D1/R2保存先、LiveKit鍵・Roomを分離できた。別環境のCookieは手動転送しても401、別LiveKit鍵も拒否した。片方のreset/stop後も他方の認証・下書き全内容・Roomを保持し、元環境のhealthも200だった。一時worktree・process・container・16port・共有台帳の2予約を片付けた。詳細は `.local/tablecast-isolation-report.json` に残す。

実LiveKitへ2ブラウザーで接続し、440Hz合成音声の41 packets・38,400 samples・RMS 0.070536を確認した。Room削除で両参加者の切断も確認した。実マイクと外部AIは使っていない。`.local/livekit-check.json` に記録し、再実行scriptをCIにも追加した。

## 統合時に修正した問題

ルートの `bun run storybook` で起動しHTTP200を確認した。専用portを使い、自動繰上げを禁止する。一時的な未await Promiseを `no-floating-promises` が検出して終了1となることも確認し、その一時ファイルは削除した。

JSONCの末尾カンマを通常JSONで読んでいた起動不良を、導入済みの標準 `jsonc-parser` に置換した。本番相当実行はCloudflare Vite previewで、公式buildが生成したmanifestから2 Workersへ接続する。ローカル資源名と秘密を含むbuildは共有cacheへ入れない。

Mastraの管理adapter経由のNode初期化を除き、公式 `RequestContext` と `Agent.stream` をHonoから使う。公式 `Mastra({ logger: false })` でprovider例外の会話本文を一般ログへ出さず、HTTPエラーと失敗turnは維持する。Viteが生成した2 Workersを実workerdで起動し、GUI・OAuthを通した。

WebSocketの受信予約コード1005/1006/1015を再送していた不具合を、固定1000の終了応答へ修正した。handlerを削除する案は採用版の実試験で正常終了しなかったため、必要な明示返信を残した。Wranglerの接続台帳も公式 `WRANGLER_REGISTRY_PATH` でworktree内へ分離した。`dev:parity` は実行ごとに最新のbuildを確認して再起動する。

E2Eで卓を開いた後に画面を再読込みする際、選択店舗が初期値へ戻ることを見落としていた。試験内で対象店舗を再選択し、Chromium/WebKit両方の4件が成功した。

通常の全体チェックはサンドボックスによるuv cacheへの書込み拒否があったため、同じ無課金コマンドを必要権限で再実行した。テストをskipや型キャストで通していない。

MCPは認証済み管理者によるクライアント事前登録を使う。匿名DCRの有効化は自動承認レビューで拒否されたため変更していない。この制約下で組織選択・同意・PKCEまでブラウザー試験に合格した。

Wrangler 4.129.0の複数config起動では、リクエスト切断でProxyControllerが `Network connection lost` を致命的エラーとして終了した。予約WebSocketコードの修正後にも再現する別問題であり、[対応する未反映の上流修正](https://github.com/cloudflare/workers-sdk/pull/15207)を確認した。独自patchや自動再起動で隠さず、導入済みの公式Vite previewへ切り替えた。独立したpreview環境では、正常WebSocket終了10回とタブ閉鎖10回の後も毎回health 200、プロセスと認証の維持を確認した。統合した `dev:parity` でもChromium/WebKitの注文・認証4件が20.4秒で成功した。

最終の起動経路でも正常終了10回・タブ閉鎖10回後のhealth 200と認証維持を確認した。previewの秘密ファイルは0600、client成果物への秘密値の一致は0件だった。通常buildへ戻した際は、配備用のWorker名とmanifestへ戻り、ローカル `.dev.vars` が残らないことを確認した。結果を `.local/tablecast-preview-final.json`、T01の日本語画面を `.local/tablecast-kiosk.png` に残した。

## 未実施の受入

GitHub上のCIは未実行。ローカルで同じ静的解析・各層試験・本番相当E2Eを実施した。

外部Inworld/LLMの往復、実iPadのAEC・騒音・割込み、Googleログイン、ChatGPTからの実MCP接続、公開配備と復旧は未実施。Inworld話者patchの完全SHAは保存しているが、公開forkの依存として未適用である。PoC全体の外部受入完了とは判定しない。

[構成の実現可能性・課題・改善点](feasibility.md)と[公開・移行・復旧手順](deployment.md)に詳細を記録する。
