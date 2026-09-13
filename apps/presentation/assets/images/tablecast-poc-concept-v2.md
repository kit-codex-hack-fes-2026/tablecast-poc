# PoC構成図 v2：ユーザー参照に沿った3領域の見本

作成：2026-09-13。組込みimage_genによる生成と、接続線の画像編集。

- [ユーザー提供のデザイン参照](tablecast-poc-user-reference.png)：元ファイル名 `content.png`（ローカル配置は非公開）。ユーザーは「こういうのがいい」と見せ方を指定。
- [今回生成した見本](tablecast-poc-concept-v2.png)：参照画像の3領域、ロゴ、端末、役割説明、情報密度を引き継いだ。v1の疎な構成図より、この方向を次版の基準にする。
- この生成結果そのもののユーザーレビューは未実施。sample.json・映像・音声は未変更。

## 参照画像から補正した技術内容

右側へPython LiveKit Agentを追加し、OpenAI Realtimeの音声理解・テキストとツール呼出し、Inworld TTSの発声を区別した。通常経路としてのInworld STTは記載しない。Agentから業務APIへの線にはWeb経由の認証済みHTTPと注記する。

利用者3役のWeb操作をフロントエンドへ集約し、そこからAPIへのService Bindingを示した。D1は業務データの正本、DOは状態通知、WorkersはWeb/API、R2は画像・ファイルとして対応付けた。図は主要経路の説明で、配備図や測定した分散トレースではない。

## 実画面参照と生成物の限界

生成時に次の実録静止画を添付した。

- 客：[tablecast-guest-screen-v13.png](tablecast-guest-screen-v13.png)。
- 店員：[tablecast-recap-staff-v13.png](tablecast-recap-staff-v13.png)。
- 管理者：[tablecast-admin-screen-concept-v2.png](tablecast-admin-screen-concept-v2.png)。assets/demo/tablecast-macbook-admin-v13.mp4の4秒から、FFmpegで1フレーム抽出した。

生成された端末画面は参照元のレイアウト・文字・金額と完全には一致せず、端末の下端が一部省略されている。このPNG内の画面を実録の証拠にしない。動画化では、端末枠と画面の領域を分け、上記の元画面を縦横比を保って配置する。説明図の文字・ロゴ・矢印も完成動画の解像度で再確認する。

## 映像への展開方針

3領域の全体像を見せた後、発話に合わせて対象を囲み、経路を強調する。詳細を読ませる区間では該当領域へ寄り、全体図の位置関係が追えるようにする。常時表示する背景画像と、動かす線・注記・実画面は重複させない。字幕は図の下端へそのまま重ねず、専用の帯を確保する。

## 生成プロンプト

```text
Use case: infographic-diagram / reference-guided redesign.
Produce ONE high-resolution 16:9 Japanese architecture presentation image for TableCast, ideally 2560x1440 or larger. Match the supplied Image 1 very closely in visual language, information density, three-column layout, section backgrounds, brand logos, device photographs/screens, typography hierarchy and clean white rounded rectangles. The user explicitly prefers this richly informative presentation over a sparse flowchart. Keep the composition packed with useful readable detail, professionally aligned, with controlled white space and visible connector labels.
INPUT ROLES:
Image 1 (content.png) is the design/layout reference and redesign target; its technical claims and fake device screens must be corrected as specified below.
Image 2 is the ACTUAL guest UI to place inside an iPad frame.
Image 3 is the ACTUAL staff UI to place inside an iPhone frame.
Image 4 is the ACTUAL admin UI to place inside a MacBook frame.
Preserve the screenshot images as provided, fitting their natural proportions. Do not invent a different dashboard, change the UI content, add fake logos inside the screenshots, or substitute reference Image 1's fabricated UI. The screenshot panels are illustrative embeds of recorded screens. No people. No decorative robot mascot.

HEADER retain the visual character of Image 1:
"TableCast アーキテクチャ"
"卓上AIキャストによる音声注文・接客・店舗管理"
Small TableCast brand at top right similar to reference.

COLUMN 1: pale blue, title "1. 利用者と端末"
Three stacked white cards, each with device screenshot at left and concise bullets at right:
"来店客" — iPad with Image 2; bullets "声で相談・注文", "タッチGUIでも操作", "日本語 / English".
"店員" — iPhone with Image 3; bullets "卓・注文状況の確認", "提供・会計の対応", "ログ・状態の確認".
"店舗管理者" — MacBook with Image 4; bullets "メニュー・価格の管理", "多言語・接客設定", "端末・運用管理".
At bottom a small ChatGPT logo and line "ChatGPT + MCP / 店舗設定の補助". It is a settings path, not part of voice inference.

COLUMN 2: pale mint, title "2. TableCastアプリ基盤"
Top card "フロントエンド" with recognizable TanStack logo and "TanStack Start", two internal labels "客向けGUI" and "店舗管理画面". Smaller note "Web Worker / ブラウザーUI".
Middle card "共通API・業務ツール" with Hono and Mastra logos. Bullets "価格・店舗と卓の認可", "カート・確認・注文確定", "GUIと音声で業務処理を共有".
Bottom card Cloudflare logo and four correctly named icons "Workers", "D1", "Durable Objects", "R2".
Below icons, short mapping lines: "Workers：Web / API", "D1：業務データの正本", "DO：状態通知", "R2：画像・ファイル".
Include "単一オリジン / Service Binding" as a short label between Web and API.
The Cloudflare panel explains the deployment/storage services, do not depict all services as mandatory sequential processing stages.

COLUMN 3: pale peach, title "3. 音声・AI基盤"
This column MUST correct reference Image 1's architecture:
Top compact white card LiveKit logo, "LiveKit", "WebRTC・音声セッション".
Next white card Python logo, "Python Agent", "LiveKit Agents", subtext "会話・業務ツール・再生を接続".
Below, two separate white service cards:
OpenAI logo "OpenAI Realtime", labels "音声入力 → テキスト・ツール呼出し", "音声理解・応答生成".
Inworld logo "Inworld TTS", labels "テキスト → 音声", "接客音声の合成".
Do NOT include Inworld STT. Do NOT suggest Mastra directly runs the normal realtime voice model. Python Agent is essential and must be prominently shown.
Connect LiveKit <-> Python Agent labeled "音声".
Connect Python Agent <-> OpenAI Realtime labeled "音声 / テキスト・ツール".
Connect Python Agent <-> Inworld TTS labeled "テキスト / 音声".
Do not connect LiveKit directly to Inworld. Do not connect OpenAI directly to Hono/Mastra. Route service lines in free margins without crossing card text.

BETWEEN COLUMNS:
- All three user roles connect to the frontend card via blue arrows for web operations. None of these web arrows should terminate directly on database or voice services.
- Customer browser/front-end UI <-> LiveKit route labeled "WebRTC：マイク・再生", understood as browser media, NOT Worker proxy transport.
- Python Agent -> common API arrow labeled "認証済みHTTP / Web経由". It routes business tool calls through the Web entry point; this is a separate path from audio.
- Frontend -> API short downward arrow labeled "Service Binding".
- API -> Cloudflare data area link for "保存・通知".
Use blue for web/business and teal/orange for voice, like reference. Every arrow should terminate at the intended boundary and avoid other text. No stray or orphan arrows.

BOTTOM same visual style as reference:
a slim full-width workflow ribbon titled "注文の流れ", then "来店客 → 音声Agent → 共通APIで確認・承認 → D1へ保存 → 店舗へ共有".
Small footnote beneath: "主要経路の説明図 / 音声承認は読了後の新しい発話が必要。GUI承認は独立経路。"
The graphic is a PoC architecture explanation, not proof of production performance or a measured distributed trace. Keep all Japanese and English crisp, correct, readable and faithfully typeset. Prioritize faithful reference layout and rich technical information over adding decoration.
```

## 接続線の修正プロンプト

```text
Make a surgical connector correction to this TableCast architecture image. Preserve all three columns, titles, text inside every card, logos, device images, color, spacing and all of the right-hand audio architecture unchanged.
In the gap between the LEFT user column and the MIDDLE application column, replace ALL existing blue user-routing connectors with exactly ONE clean shared Web operation bus:
- A thin vertical blue bus at x about 36 percent of image width (the empty gutter to the LEFT of the middle cards), from the admin row height up to the FRONTEND row height.
- Three short horizontal input branches from the right boundaries of the guest, staff and administrator cards into this bus.
- Exactly one right-facing arrow from the top of the bus into the LEFT BOUNDARY of the FRONTEND card (the card named フロントエンド with TanStack Start).
- All three roles therefore enter the FRONTEND. NO role should connect directly to the common API card.
- Erase the old bent blue line that starts at the guest row and drops down into 共通API. Erase the old staff arrow directly entering 共通API.
- Remove the old labels "Webブラウザー (注文・操作)" and the misplaced "Web Worker / ブラウザーUI" from the left gutter. Replace with a single concise label "Web操作" next to the common bus, without touching any text.
The FRONTEND -> 共通API downward arrow labeled Service Binding must remain. Right-hand Python Agent <-> API line with label 認証済みHTTP / Web経由 must remain. All voice service arrows remain.
This edit changes the left user connector topology ONLY. No other redesign. Keep the same aspect ratio.
```
