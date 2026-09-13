# 技術紹介v15の画像・ロゴ

2026-09-13。ユーザー提供の `tablecast-poc-user-reference.png` と、画像生成で作った `tablecast-poc-concept-v2.png` を構成の参考にした。3領域・技術ロゴ・端末画面・役割説明をHTML/CSS/SVGで再構成し、発話に合わせた強調を付けた。生成画像の画面・文字を実装の証拠として使用していない。

## 実画面

- 来店客：`tablecast-guest-screen-v13.png`。採用済み実録。
- 店員：`tablecast-recap-staff-v13.png`。採用済み実録。
- 管理者：`tablecast-admin-screen-concept-v2.png`。`assets/demo/tablecast-macbook-admin-v13.mp4` の4秒からFFmpegで抽出した実画面。名称のconceptは用途を示し、生成UIではない。
- 注文確認：`tablecast-technical-confirm-v14.png`。採用済み客側元録画の122秒から取得。詳細は画像README。

## サービス識別用SVG

Iconify配布SVGをローカルに保存。新規ライブラリーは導入していない。サービスの商標は各権利者に帰属する。

| 保存名（tablecast-logo-の後） | 取得元                                               |
| ----------------------------- | ---------------------------------------------------- |
| hono.svg                      | https://api.iconify.design/logos/hono.svg            |
| python.svg                    | https://api.iconify.design/logos/python.svg          |
| cloudflare-icon.svg           | https://api.iconify.design/logos/cloudflare-icon.svg |
| livekit.svg                   | https://api.iconify.design/simple-icons/livekit.svg  |
| openai.svg                    | https://api.iconify.design/simple-icons/openai.svg   |
| tanstack.svg                  | https://api.iconify.design/thesvg-color/tanstack.svg |
| mastra.svg                    | https://api.iconify.design/thesvg-color/mastra.svg   |

Cloudflare Workers・Pagesの個別SVGも取得したがv15では使用せず、Cloudflare配下は製品名と役割を文字で示す。Inworldも製品名を文字で示す。

## 図の省略範囲

主要経路の説明図。TanStack Start欄にWeb WorkerとブラウザーUIをまとめて表示する。音声Agentの業務HTTPはWeb入口経由だが、図では共通APIの責務への接続として示し、凡例に入口を記載する。Cloudflare欄はサービスの役割を示す。通常経路はOpenAI Realtimeのtext/tool出力とInworld TTSであり、Inworld STTは示さない。
