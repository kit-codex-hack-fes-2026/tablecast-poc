# TableCast 実装・検証記録

更新: 2026-09-06

ユーザーの指定によりローカル実装を先行する。外部資格を使用する実音声、OAuth、ChatGPTからのMCP接続、公開環境、iPad実機試験は後続の受入とし、未実施を成功扱いにしない。

## 現在の段階

段階0–4のローカル実装を作成し、統合検証中。開始時は仕様文書と挨拶用の雛形のみだった。仕様の基準は `7da695b`、不要なClaude/Cursor指示の削除は `aff12ad`、生成した商品画像12点は `94d3352` に保存した。pushは行っていない。

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

| 確認                          | 結果・証拠                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `bun --no-env-file run check` | 全体format/lint/typecheck成功。ルート7件、Python66件、Web音声単体4件、当時のAPI42件成功                                            |
| 追加のAPI修正                 | 実workerd・D1・DOの44件成功。二重開始、停止済みturn、音声有効フラグ、公開後のカート修正を含む                                      |
| 更新後のUI部品                | Storybook20件、Web音声単体6件成功。日英・選択・エラー・アクセシビリティ                                                            |
| ブラウザー                    | Chromium/WebKitの計4件で注文→受付→提供→模擬支払→閉卓、認証付きMCP事前登録→組織選択→同意→PKCEを検証。新デモ・本番相当環境で再確認中 |
| 実R2・Images                  | 日本酒PNGをHTTP200、640×640 WebP、36,858bytesで取得                                                                                |
| デモの初期化                  | 新しい居酒屋データを実D1へ投入。3店舗36卓、初期注文15件、event102件、商品180件                                                     |
| history                       | 独立した実D1で600履歴セッション、総注文2,415件、2万超event。再seed件数不変、T01の操作状態保持、外部キー・店舗境界・残額0を検証     |
| 背景進行                      | `demo:play`で正規APIから12操作。T01とT12は進行対象から除外                                                                         |
| 固定patch                     | 公式pluginの隔離環境で13件成功。通常のPython試験とは別扱い                                                                         |
| Git hooks                     | Lefthookのpre-commitとpre-pushを導入済み。自動stageを行わない                                                                      |

## 統合時に修正した問題

ルートの `bun run storybook` で起動しHTTP200を確認した。専用portを使い、自動繰上げを禁止する。一時的な未await Promiseを `no-floating-promises` が検出して終了1となることも確認し、その一時ファイルは削除した。

JSONCの末尾カンマを通常JSONで読んでいた起動不良を、導入済みの標準 `jsonc-parser` に置換した。Wranglerの本番相当実行は、APIを再bundleせずビルド済みWorkerへ接続する。WebのVite生成chunkには公式生成形式と同じESModule規則を設定する。

通常の全体チェックはサンドボックスによるuv cacheへの書込み拒否があったため、同じ無課金コマンドを必要権限で再実行した。テストをskipや型キャストで通していない。

MCPは認証済み管理者によるクライアント事前登録を使う。匿名DCRの有効化は自動承認レビューで拒否されたため変更していない。この制約下で組織選択・同意・PKCEまでブラウザー試験に合格した。

## 未実施の受入

3worktree同時起動・停止分離、本番相当起動での新デモE2E、実ローカルLiveKitの合成音声疎通を検証中。

外部Inworld/LLMの往復、実iPadのAEC・騒音・割込み、Googleログイン、ChatGPTからの実MCP接続、公開配備と復旧は未実施。Inworld話者patchの完全SHAは保存しているが、公開forkの依存として未適用である。PoC全体の外部受入完了とは判定しない。

[構成の実現可能性・課題・改善点](feasibility.md)と[公開・移行・復旧手順](deployment.md)に詳細を記録する。
