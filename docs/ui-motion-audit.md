# Webの動きの適用範囲

対象: #359 / PR #360 の共通UIを基盤にした積み上げPR。業務API・schema・店舗テーマの編集仕様を変更しない。

## 原則

- 押下120ms、hover150ms、Menu/Popover/Select180ms、Dialog/Drawer220ms、状態200ms。
- Base UIの標準入退場属性を使う。動きの完了を操作条件にしない。
- focus輪郭は即時。CSSはcolour/background/border/shadow、入退場はopacity/transform。実データの開閉だけ高さを遷移する。
- 移動・拡縮・反復はreduced motionで停止する。非表示の音声描画も停止。
- 静的カード・統計数値・表行の装飾的移動、同一ページの検索条件更新にはページ遷移を付けない。
- 音声・カメラ・入力はmotionのために再mountしない。音声orb・波形とボタンの虹色リングは既存の表現を維持する。

## 全Webへの適用

| 画面・対象                       | 動かすもの                                                                                                     | 維持するもの                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| シェル全体                       | ナビのhover・layoutIdによる選択位置、200msの幅切替、ユーザーMenu、グループ開閉、mobile Drawer                  | active org・展開状態・triggerの位置・focus |
| 店舗ホーム・フロア               | 共通操作、タブ、卓詳細Dialog、関連フォーム結果                                                                 | 統計の行・数値、floor位置                  |
| 商品・カテゴリ・プラン・modifier | 言語タブ、詳細編集の開閉、入力境界、保存状態                                                                   | 未保存値・Undo・409時の入力                |
| 接客                             | Markdown/Previewとlocale切替、保存状態                                                                         | textareaのDOM・入力・音声設定              |
| デザイン                         | 画像/部品/バナーの編集開閉、画像保存結果                                                                       | ドラッグの直接操作・既存テーマ             |
| 下書き・変更確認・履歴           | 版選択Menu、SaveStatus/DraftStatus、検証/公開処理、承認Dialog                                                  | 操作前の明示承認・権限・対象版             |
| 会員・ポイント・クーポン         | 共通Button/Select/Dialog、訂正フォームの開閉と結果                                                             | 金額/ポイントの業務判断                    |
| 請求・統計                       | 月選択Popover、概要/商品/選択肢の共有Tabs、表の表示開閉、共通操作                                              | Chart/統計の装飾的な数値移動は行わない     |
| 認証・アカウント・同意           | 入力/操作の応答、確認Dialog、エラー/処理結果                                                                   | フォーカス・同意状態                       |
| MCP・Skills・接続導入            | Copyの成功記号、失敗/完了、共通操作                                                                            | 手順の固定レイアウトと入力領域             |
| 店舗導入・端末pairing・demo      | 共通操作、機器評価領域の開閉、状態結果                                                                         | 端末/音声接続・画面寸法                    |
| 客メニュー                       | 方向付きタブ・選択位置、カート追加件数、数量、AnimatePresenceによる行の入退場・layoutによる位置、注文確認/完了 | voice/camera/cart identity、明示確定       |
| 客会話・カメラ                   | 新規発話の200ms入退場、字幕追記150ms、ツール結果、音声状態の200ms補間、機器設定の開閉                          | 常設frame・許可/停止・非表示track解放      |
| 卓上ゲーム・同席者               | Dialog/Drawer、注文帰属の開閉、共通操作                                                                        | game iframe sandboxと業務境界              |
| 会員本人                         | 保存設定の開閉、会員証/ポイント/券の共通操作・結果                                                             | メール公開範囲・本人認証                   |

共通部品: Button、Input、NativeSelect、Select、Checkbox、RadioGroup、Tabs、Disclosure、Dialog、ConfirmAction、MonthPicker、DatePicker、Menu、Combobox、ErrorNotice、FieldErrors、ActionFeedback、CopyValue、ResizableHandle。

## ページ・対象の連続性

TanStack Routerの`defaultViewTransition`でページ本文の描画snapshotだけを遷移する。管理、MCP/Skills、アカウント、会員、認証、デモ一覧の既存shellを対象にする。サイドバー・ヘッダーの位置とOutletの寿命は変えない。初回SSR、検索条件だけの変更、客端末・接続済みデモを出入りする遷移にはページ遷移を追加しない。戻る操作では移動方向を反転する。未対応ブラウザーはRouterのonResolvedから既存本文だけをMotionで200ms入場させる。旧画面を複製せず、連続操作では前の動きを終点へ進める。reduced motionでは即時切り替える。

サイドバーの幅は既存ResizablePanelのflex-growをボタンによる切替時だけ200msで補間する。ドラッグ・矢印キーでの幅調整は即時に追従し、途中反転と保存した幅を維持する。リンク・入力・本文は再mountしない。縮小中も各グループのリンクDOMを保ち、保存済みで閉じたグループへ再展開するときのfocusはその見出しへ戻す。見出しから縮小するときは同じグループの先頭リンクへ移す。reduced motionでは即時切替にする。

TabsのRootはLayoutGroupで独立させ、選択面の輪郭と陰影のlayoutIdをタブ間で共有する。輪郭は文字色に依存せず、明るい非選択面を通る移動中も追えるようにする。PanelはBase UIの選択方向に8pxだけ入る。keepMountedは既存callerの指定だけに従い、非選択画面のQueryを新しく起動しない。カートのAnimatePresenceはpopLayoutを使い、削除した行を即時inertにして残った行を同一DOMのまま移動する。数値更新では行のlayoutを動かさない。Motionのlayout機能はdomMaxの遅延chunkに含める。会話は発話IDをkeyとして保持し、新しい発話だけをAnimatePresenceで入場させる。既存本文をtoken更新のたびに再mountせず、Streamdownの標準機能で追記された文字だけを150msで表示する。読取待ちを作るstaggerは使わない。退場中の待機表示は即時inertにし、音声操作とカメラは履歴の入退場から独立させる。

## 検証の境界

共通操作は`motion-system.browser.test.tsx`でChromium・WebKit・reduced motionを確認する。途中反転、終了中surfaceの操作・支援技術への非公開、入力とfocus、非選択言語の必須項目、通知領域のDOM寿命を検証する。画面の業務状態は既存Browser・Storyを維持し、SSR・注文・公開の実接続は既存E2Eに残す。

Storybookの動きに並べた例から、通常・処理中・成功・失敗と狭幅を確認する。実施した結果とSHA・画像・動画はPRへ記録し、この文書を検証成功の証拠にしない。実機Safari・VoiceOver・カメラやマイクを使う試験は、自動WebKitとは区別する。
