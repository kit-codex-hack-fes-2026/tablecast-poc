# デモデータの検証記録

2026-09-13、Issue #118のローカル作業差分を確認した。Bun 1.3.13、emulate 0.11.1（画像表示patchあり）、Wrangler 4.129.0、Vitest 4.1.11を使用した。画像生成のプロンプトと由来は[画像資料](assets/README.md)を参照する。

| 対象                     | 結果と保証                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixture                  | `scripts-unit` 4件成功。3店舗132商品、36卓、日英説明、料理に合う選択肢、smokeの参照整合を確認                                                                                           |
| seed                     | `scripts/tablecast-seed.test.ts` 1件成功。隔離した実D1/R2へ600履歴・2,415注文を投入し、外部キー・時系列・会計・再seedでの既存データ保全を確認                                           |
| 標準リセット             | このworktreeの未作成DBへ `demo:reset --profile demo` で3店舗132商品を投入。旧資格情報を模したメール2件が共通名簿へ戻り、既存パスワードの保持と両ownerの実認証が成功                     |
| メンバーと会話           | seed検査で各org owner/admin/member各1名・計9所属を確認。T02の2話者と話者不明、数量2→1への訂正を合成ログとして記録                                                                       |
| 画像とdeploy設定         | seed-media/deployの既存9テスト成功。画像の保存・再開・配備設定の対象検査を実施                                                                                                          |
| 型と静的検査             | root TypeScript、emulate TypeScript、変更TypeScriptのtype-aware Oxlint、変更文書・ソースのOxfmt成功                                                                                     |
| Google選択画面           | 実emulateへ標準seedを渡し、8人の店舗メンバーと未所属連携テスト用1人の画像9点が読み込まれ、氏名・店舗・役割を表示することをブラウザで確認。上流既定のTest Userは画像なしイニシャルを維持 |
| 実アプリのGoogleログイン | 既存PlaywrightのChromium・1 workerで1件成功。ログイン→プロフィール更新→店舗作成→招待メール→招待先のGoogleログインと参加を確認                                                           |
| 配布形式                 | `bun build apps/emulate/src/index.ts --target=bun`成功。Dockerfileの既存patchコピー・Bun install経路を使用                                                                              |

実画面の証拠は[PR #126の添付](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/pull/126)で確認する。PR用スクリーンショットは`.local/evidence/`などのGit管理外へ保存し、リポジトリには含めない。UIの役割表記を認可の根拠にせず、実際の認可はDBの所属を使う。

このworktree専用の `.local/state` にデモDBを用意した。資格情報は権限0600の `.local/demo.json` に保存し、検証用プロセス・待受ポート・コンテナは停止済みである。既存の開発DB・本番DBへの上書きは行っていない。別の環境へ新しい構成を投入する際は[既存の安全なリセット手順](../demo.md#安全なリセット)を使う。

## 店舗名と音声素材の追加確認

店舗名を京料理こもれび四条店とWestward Burgers Kyotoへ揃え、3つのfixture profile・共通名簿・資料を照合した。上記fixture 4件とroot/emulateの型・変更TSのlintを再確認した。このworktreeのデモDBだけはDrizzleの条件付きbatchでstore・organization各2行の名前を更新し、他15テーブルの行と値が保持されることを確認した。通常seedの既存データ保持契約は変更しない。

模擬Google画面を新しい店舗名で撮影し直した。全9アイコンの`naturalWidth/Height`が150で読み込み済みであることを確認した。画像は標準viewportの表示範囲である。

Inworld `inworld-tts-2`で客42発話・店員参考3発話のMP3を生成し、客同士の250ms差の重なりをWAVへ合成した。全46本のローカルデコード、48kHz・mono、正の実長、SHA照合が成功した。MP3総尺293.232秒、重なり4.512秒。再実行は追加生成0本・既存MP3再利用45本だった。[音声manifest](../../assets/demo/audio/manifest.json)へ実生成時刻・声の指定・SHA・実長を残す。

年齢・性別・US/UK/India/Chinaのアクセントは生成時の演出指定であり、実聴の所見は未記録である。合成音声は実音声認識の精度・性能の証明ではない。実Realtime応答を伴う有料E2E、ChatGPT本番MCP、最終動画の収録・公開、本番配備はこの記録の成功範囲に含めない。CIとPR previewの結果は対象SHAとともにPRへ記録する。
