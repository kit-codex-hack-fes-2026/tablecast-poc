# 接客プロンプトエディター

[Issue #177](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/177) · [UI仕様](ui.md) · [MCP契約](mcp.md)

## 採用構成

2026-09-15、実装開始時の `origin/staging` は `5c16b5e`。PR作成時に文書変更#218を含む `9c92644` へ追従した。#199〜#204の統合済みフォームを使用する。

Tiptap 3.31.3のReact、StarterKit、Suggestionを使う。段落、見出し1〜3、箇条書き、番号付きリスト、太字、斜体、Undo/Redoに限定する。スラッシュ候補は段落先頭で開き、検索、上下キー、Enter、Escapeを扱う。候補表示にアニメーションを加えない。

画像、添付、埋込、リンク、コードなどのノードは保存schemaに含めない。HTML貼付けは非接続のtemplateで禁止要素と属性を除去し、ProseMirrorの標準parserへ渡す。文章は保持し、除外した画像等を通知する。画像ファイルのdropは挿入せず通知する。標準の編集履歴・選択・リスト操作を使い、独自の文書エンジンを作らない。

## 保存とモデルへの投影

`cast.instructions.ja/en` は旧文字列、または次の版付き文書を受け取る。

```json
{
  "format": "tiptap-json",
  "version": 1,
  "document": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "丁寧に案内する" }] }]
  }
}
```

正本はこの値一つとする。本文の複製を保存しない。D1の既存 `config_json` を使用し、列追加や移行SQLは不要。差分は言語ごとに1項目として扱う。

APIの `instruction-model.ts` が許可schemaと `instructionText` を所有する。旧文字列はそのまま、文書は見出し・リスト・強調・改行を含む文字列へ決定的に投影する。LiveとResponses delegationには、この同じ結果をJSON文字列化して渡す。Webは共有関数を文字数・概要表示に使い、業務処理を複製しない。

上限は従来と同じ5,000 UTF-16単位で、文書の場合は投影後の書式記号と改行を含む。入力は切り捨てず保持し、超過を表示して保存を止める。APIも検証する。リストは3段まで。構造検証の前に30,000値・深さ40までの走査で過度の構造を拒否する。HTTP全体の既存サイズ制限も維持する。

旧本文はMarkdownと推測せず、literal textとhardBreakで表示する。開く・focusするだけではdirtyにしない。実際に変更した言語だけを文書へ変え、Undoで元の文書へ戻れば旧文字列へ戻せる。

### Markdownを正本にしない理由

調査ではTiptap Markdown 3.31.3の標準往復を18入力で確認した。基本書式は扱えたが、literalの `# 記号` が見出しへ変わり、連続hardBreakと末尾改行を無損失に保てなかった。独自parserで補修せず、文書JSONを選んだ。Markdown拡張は製品依存へ追加していない。

公式資料: [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)、[ReactとSSR](https://tiptap.dev/docs/editor/getting-started/install/react)、[Suggestion](https://tiptap.dev/docs/editor/api/utilities/suggestion)、[schema](https://tiptap.dev/docs/editor/core-concepts/schema)。

## 読取互換と展開

HTTPは `X-Tablecast-Instructions: 1` がある場合に文書を返す。旧クライアントには投影した文字列を返す。下書き・公開catalog・卓・デモを同じ規則で扱う。新Webの共有clientはSSRとブラウザー双方でこのheaderを送る。

保存時の `instructionFormatVersion: 1` はHTTPとMCPで共通。文書を書き込むクライアントは必須とする。省略した旧クライアントは旧文字列の下書きを更新できるが、既に文書になった下書きの更新は409 `DRAFT_CONFLICT` とする。version・status・storeに加え、D1 UPDATE条件の `json_type` で現在の両言語が文字列であることを確認する。追加の事前SELECTをせず、競合中に書式を上書きする隙間を作らない。DrizzleのUPDATE内で、JSON型判定に必要なSQL式のみ使用する。

APIの互換readerを先に配備し、その後に新Webを配備する。MCPのtool schemaにもunionと保存版を公開する。文書が保存された後は、文書を読めない旧APIへ戻さない。Webだけを旧版へ戻した場合は表示できるが、文書下書きへの保存は拒否される。

## フォーム・描画

TanStack Formが入力の正本、Tiptapが選択と編集履歴を所有する。保存成功・再読込・破棄は既存のフォーム操作を使う。保存待機・読取専用時はcontenteditableとtoolbarを明示的に停止する。503・409では入力を保持する。外から異なる保存値へ戻すと編集履歴を初期化する。初回hash focusは遅延ロード後に一度だけ行う。

編集器はhydration後に動的importする。SSR・ロード中は読取専用の本文を表示し、失敗時は再試行を出す。公開概要・全文・差分はReactによる許可ノードの描画を使い、編集器をロードしない。HTML文字列の直接描画は行わない。

## 検証境界

- API unit: 旧文字列、改行、空文書、書式、文字数、禁止ノード・属性、過度の構造、JSON schema。
- D1統合: HTTP保存・公開・再取得、言語単位の差分、旧応答、旧クライアントの上書き拒否。音声開始の実経路から両モデルの要求本文を検査する。
- Browser: 編集・Undo・再読込、スラッシュ、合成compositionイベント、HTML混在貼付け・画像のみの貼付けでの選択本文保護、ファイルdrop、disabled、上限保持、503・409後の両言語と書式保持。
- Chromium/WebKit E2E: 日本語・英語の概要→編集→保存→再読込→公開。実DBとbuildされたアプリを使う。

Browser / Storybookの依存最適化には、遅延読込するTiptapも事前に含める。テスト途中の依存再最適化によるページ再読込を避ける。

実行結果・対象commit・画像はPRへ記録する。合成compositionイベントは実iPadの日本語IME・VoiceOverの検証を代替しない。実機のIME・支援技術による確認は未実施。

### ビルドでの確認

2026-09-15の実アプリVite buildで編集器は独立chunkになり、clientの `prompt-editor-input` は406.58 kB、gzip 128.79 kBだった。共有依存・CSSを含むアプリ全体の増分ではない。編集画面で実行を遅延する一方、既存PWAは全assetをprecacheするため、service workerの初回保存通信からは除外されない。SSR・API・service workerを含むbuildが成功した。実行環境はBun 1.3.13 / Node 24.2.0であり、Nodeはrepo推奨の24.7.0以上ではない。
