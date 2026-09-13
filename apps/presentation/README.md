# TableCastの動画生成基盤

[Issue #1](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/1)の再生成可能な動画制作workspace。商品紹介と技術紹介を別々の全編MP4として作る。

- [生成ルート・採用技術・重要事項](GENERATION.md)：工程と判断の正本。
- [次のセッションへの引き継ぎ](HANDOFF.md)：到達点、保存状態、残件、再開方法。
- [実行手順](WORKFLOW.md)：対象だけを再生成・再編集・収録する手順。
- [題材ごとの制作メモ](BRIEF-TEMPLATE.md)：目的・根拠・撮影・編集・完成品レビュー。
- [別題材の検証用入力](examples/tablecast-booking/README.md)：ブランドや場面名を変えて同じ工程を通す模式台本。

通常の生成は`apps/presentation`で次を実行する。`--name`には毎回未使用名を指定する。

```powershell
bun run video --project projects/tablecast-main-rerecord.json --film technical --name tablecast-technical-next --render
```

指定台本のbuild・配置／遷移検査・MP4出力・復号／音量／全編再生を順に実行し、`output/<name>/report.json`へ実結果を保存する。新規録画と有料TTSは独立した工程。実装変更時は先に制作メモと撮影条件を更新する。

## 現在の成果物

| 動画        | 状態                                        | 全編                                                 |
| ----------- | ------------------------------------------- | ---------------------------------------------------- |
| 商品紹介v14 | main追従の再収録。117.3秒、ユーザー評価済み | [商品紹介](assets/films/tablecast-product-v14.mp4)   |
| 技術紹介v17 | main追従の再収録。63.1秒、ユーザー評価済み  | [技術紹介](assets/films/tablecast-technical-v17.mp4) |

1920×1080、30fps、H.264/AAC、字幕・音声・BGM・SE付き。新規checkoutの準備、保存素材、UI変更試験の動画は[共有と復元](SHARING.md)を参照する。独立字幕は生成ごとの`dist/<name>/captions.vtt`に出力する。ローカルの旧通常名MP4は以前の版のまま保持している。

商品紹介は実画面から相談・注文・停止・確認・承認・店舗側操作を説明し、客＝iPad、店員＝iPhone、管理者＝MacBook＋ウィンドウ枠を表示する。成功済みの客・店員素材と、再撮影した管理画面を使う。

技術紹介は成果、全体構成、音声方式、注文の状態遷移、条件別検査、応答時間の測定計画の6場面。詳細を画面に残し、音声に合わせて注目先を強調する。

## 入力と生成物

現行作例の台本は`projects/tablecast-main-rerecord.json`。`sample.json`は素材実体を読まない単体テストのfixture用に維持する。`capture-plan.json`は次の撮影で必要な状態・対象・保持条件。`styles.css`と`scripts/`が検証と描画を担当する。派生HTML・timing・VTTは直接修正しない。

通常のbuild/renderは保存済み素材を使い、有料TTSやアプリの実会話を呼ばない。アプリの変更を映像へ反映するには、根拠・説明・必要な撮影素材の更新が必要。字幕・カット・図の内容と時刻の判断には手作業が残る。

`dist/`・`output/`はGit対象外。採用素材と共有MP4は`assets/`に置き、[.gitattributes](.gitattributes)でGit LFSへ保存する。共有対象と復元検査の範囲は[SHARING.md](SHARING.md)で確認する。リモート転送・PR作成は別の公開操作として扱う。

## 詳細仕様

| 文書                                     | 役割                                       |
| ---------------------------------------- | ------------------------------------------ |
| [CAPTURE.md](CAPTURE.md)                 | 見せたい情報から撮影条件を定める           |
| [ZOOM.md](ZOOM.md)                       | 対象・倍率・寄り始め・保持・引きを定義する |
| [POINTER.md](POINTER.md)                 | 実測カーソルと説明対象の扱い               |
| [TECHNICAL-BRIEF.md](TECHNICAL-BRIEF.md) | 技術紹介の問い・主張・図・根拠             |
| [LAYOUT.md](LAYOUT.md)                   | 配置・同期・端点・文字切れの検査と記録     |
| [TOOLS.md](TOOLS.md)                     | 技術・スキルの採用範囲と棚卸し             |
| [frame.md](frame.md)                     | 見た目の方針・レビュー状態・過去の制作記録 |
| [音源記録](assets/audio/README.md)       | BGM・SEの出典と使用条件                    |

見た目の採否はユーザーが判断する。全編復号・等速再生・機械検査の通過をデザイン承認や実機での運用保証と扱わない。
