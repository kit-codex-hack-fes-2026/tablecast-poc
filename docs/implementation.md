# Codexの着手順と並列開発

[索引](README.md)

## 開始プロンプト

以下はこの一式をリポジトリへ配置した後にCodexへ渡す指示例である。

```text
AGENTS.mdとdocs/README.mdを読み、$minimum-implに従ってTableCastの実装を開始してください。

既存ファイル、manifest、exports、Git差分を先に確認し、存在しない実装を前提にしないでください。
Bun + Turborepo、TanStack Start + Hono/Mastra、root livekitのPython、Inworld STT/TTSを使います。
packages/domain、packages/contracts、独立Storybookアプリは作りません。
客と店側の両UIを日英対応にし、会話を広く表示し、言語と音声停止・再開を目立たせてください。

まず最小の依存・ローカル起動・音声接続を検証し、その後GUI注文から管理画面までを縦に完成させてください。
公式pluginに不足があれば、docs/voice/upstream-patch.mdの範囲だけpatchしてください。
ゲーム、声の複製、別モデルfallback、独自STTや独自LLMループは作りません。

自作コメント、Markdown、docstring、テスト名は日本語にしてください。
実行した検証と未実行の検証を分け、各段階の実装・残る問題を短く報告してください。
```

## 段階0: 実物の確認と互換性

既存リポジトリにコードがあれば、全置換せず利用可能な構成を特定する。初期状態なら公式の最小templateから始める。
Bun、TypeScript、Vite、TanStack Start、Cloudflare plugin、Wrangler、Hono、Mastra、Vitest、Storybookの互換組合せを確認する。
PythonのLiveKit coreとInworld plugin、uv/ty/ruff/pytestを合わせ、lockfileへ固定する。架空の最新モデル・voice名を設定しない。
起動URL・state・秘密情報の所有を明確にし、最初のworktreeだけでローカル起動する。

## 段階1: リスクの高い接続を小さく確認

通常の日本語・英語STT/TTS、Inworld演技とbreak、字幕からのタグ除去、PythonからHono/Mastra streamを確認する。
STTに話者・時刻がない場合だけ公式pluginへpatchし、上流と同じ試験を行う。
LLM生成の中断、HTTP取消、音声停止、再開、注文確認の固定読上げ受渡しを最小構成で確認する。
未検証の接続を型キャストやmock成功で隠して大量のUI実装へ進まない。必要な機能を維持できない点は証拠と選択肢を記録する。

## 段階2: GUIから実業務までの縦断

ローカル認証・店舗境界・日英カタログ・カスタマイズ・カート・確認・注文・管理画面を最小の実DBで通す。
DBの制約、同時変更、冪等性、確認失効を先にテストする。架空のAPI結果で完成扱いにしない。
Storybookはこの時点からWeb内で使い、日英、長文、停止、エラー状態を同じ部品で確認する。

## 段階3: 音声とリアルタイムを接続

Mastra ToolをGUIと同じAPI内の操作関数へ接続する。音声でカートを作り、GUIで変更し、同じsnapshotを確認する。
D1の業務eventとDOの配信・欠落回復を接続し、店舗の卓タイムラインを完成させる。
会話領域、停止・再開・言語変更の競合、古いturnの書込み、タグ漏れ、エコーを検証する。

## 段階4: 店舗設定・デモ・worktree

MCPで日英メニュー・speechName・プラン・キャストを下書き登録し、検証・公開する。
本物のschemaと業務経路に合わせてseed、背景卓の進行、resetを実装する。
3つ以上のworktreeを同時起動し、ホスト、Cookie、TCP/UDP、state、LiveKitを分離できることを確認する。

## 段階5: 公開環境と受入

Workerのbuild・migration・secret・Service Bindingをデプロイし、Python Agentも対象環境へ配置する。
実iPad、日英、実Inworld、MCP、管理画面を通した受入試験を行う。
本番設定の記録、ログ、故障時GUI継続、再デプロイ、データを失わないmigrationの運用を残す。
受入条件を満たさない機能を説明だけで完成にしない。

## worktreeでの担当分割

| 担当       | 主な所有範囲                                             | 同時変更を避ける箇所 |
| ---------- | -------------------------------------------------------- | -------------------- |
| 基盤・統合 | root設定、local起動、公開exports、CI、migration統合      | lockfile、共通設定   |
| Web        | kiosk、admin、日英、Storybook                            | APIの内部実装        |
| 業務API    | 認証、catalog、cart/order/billing、MCP、DB、DO           | root起動構成         |
| 音声       | root livekit、Mastra接続、発話、upstream patch、実機試験 | APIの業務ロジック    |

契約の変更は所有API側で先に確定し、consumerのテストも同じ変更で更新する。
担当を分けるためだけにpackageを増やさない。ディレクトリ所有と小さいPRで十分である。
マイグレーションとlockfileは一人が統合する。各worktreeのローカルDBはそれぞれ更新し、ファイルコピーで共有しない。

## 記録の最小形

実装中は `docs/progress.md` を一枚作り、現在の段階、決定、実行コマンドと結果、未検証項目を更新する。
同じ内容のADR、実行計画、チェックリスト、skills本文を多数のファイルへ複製しない。
終了時は [受入条件](acceptance.md) の該当項目に証拠を残し、残る独自実装が必要な理由を説明する。
