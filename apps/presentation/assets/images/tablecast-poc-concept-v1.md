# PoC構成図の画像生成見本 v1

作成：2026-09-13。ユーザーの「PoC図を画像生成で作成して、それをもとに制作してもよい」という提案を受け、組込みimage_genで構成図の見本を生成した。

画像：[tablecast-poc-concept-v1.png](tablecast-poc-concept-v1.png)

## 状態と用途

技術編の構成・見せ方の参考画像。ユーザーによる見た目の評価は未実施。sample.jsonへの採用や映像の再生成は行っていない。端末画面は抽象図であり実アプリのスクリーンショットではない。

Web・APIの業務経路と、LiveKit・Python Agent・Realtime・Inworldの音声経路を分けた。生成後に文字と主要な接続を目視確認し、欠けていた店員→Webの接続と、Workersの囲みがD1・DOを含んでいた点を画像編集で修正した。D1とDOはCloudflareのサービスだが、図のWorkersの囲みはWeb/APIの実行単位だけを表す。

静止図をそのまま配置して経路の強調や拡大を重ねる方法と、配置を参考に必要な要素をHTML/SVGへ起こす方法を使い分ける。個々の線を動かす場合は、画像に焼き込まれた線と重複させない。画像の接続を実装の根拠にはせず、TECHNICAL-BRIEF.mdで対応するコードと照合する。

主要経路の説明図であり、DOから各画面への配信経路、認証、MCP、R2、配備・運用の詳細は省略している。

## 生成プロンプト（組込みimage_gen）

```text
Use case: infographic-diagram.
Create ONE polished Japanese technical presentation concept image for TableCast, a proof-of-concept tabletop voice service and ordering system. This is a design reference for an existing 16:9 technical video. Wide landscape 16:9, high resolution. It should feel like an elegant software architecture illustration that an engineer can actually understand, with generous space, carefully routed connections, editorial typography and restrained device illustration.

Visual style: near-white #fafafa background, dark charcoal Japanese sans-serif, muted blue #365d96 for UI and business services, teal for voice processing, amber only for external services. Flat vector-like precision with a few very subtle dimensional device illustrations. Large clear text, sophisticated hierarchy, fine boundaries. No people, photographs, fake product screens, neon, gradients, decorative floating arrows, watermarks, or dense card grids. Devices may show only abstract neutral lines indicating a screen, not invented UI. Text must be spelled exactly.

Headline at top left: "音声接客を、店舗の注文につなぐ。"
Small eyebrow: "TableCast / PoC構成図"
Subtitle: "画面・会話・業務判断を分担する"
Reserve the bottom 12 percent as an uncluttered caption/footer band.

Required architecture, all nodes and connections should be accurate:
- Left: a tasteful tablet outline labeled "客の端末" and a smaller phone outline labeled "店員の端末". These are conceptual device icons.
- Upper main row: a blue service labeled "Web" with sublabel "TanStack Start / Worker", then a stronger blue focal service labeled "共通API" with sublabels "Hono・業務ツール" and "価格・認可・注文確定".
- Right of API: cylinder labeled "D1" and small separate node labeled "DO". API -> D1 arrow labeled "保存". API -> DO arrow labeled "状態通知".
- Device web operations connect to Web, labeled "画面操作". Web -> API labeled "Service Binding".
- Lower main area: teal node "LiveKit" and a larger teal node "音声Agent", sublabel "Python / LiveKit Agents". Customer tablet <-> LiveKit line labeled "WebRTC"; LiveKit <-> Agent line labeled "音声". The staff phone does NOT connect to LiveKit.
- Agent -> Web line labeled "認証済みHTTP"; it continues through Web -> API. Do not draw the agent directly modifying the database.
- Lower right, an amber outlined group labeled "外部音声サービス" contains two separated nodes: "OpenAI Realtime", sublabel "音声理解・応答生成", and "Inworld TTS", sublabel "テキストを音声化". Agent -> Realtime sends "音声"; Realtime -> Agent returns "テキスト・ツール呼出し". Agent -> Inworld sends "テキスト"; Inworld -> Agent returns "音声". Use clean paired directional lines with readable labels, not meaningless double arrows. Realtime and Inworld must connect THROUGH the Agent, not directly to each other.
- Visually group Web and API under a subtle bracket "Cloudflare Workers". Do not put Python or the external providers inside that bracket.
- Have one small prominent annotation attached to API: "GUIも音声も、同じ業務処理へ".
- Bottom footer text: "接客・注文の主要経路を示した説明図"
- Tiny secondary footer: "配置・運用の詳細は別図で補足"

Composition: arrange this as one coherent topology with a broad upper business path and lower voice loop, not a table of disconnected cards. Clearly distinguish the guest's web and voice routes. Preserve reading order from left to right while routing cross-lane links in empty corridors. Every arrow must visibly touch its intended node boundary. No crossing through text or device screens. Important nodes, labels and connector names readable at presentation size. Prioritize clarity over extra ornament. The image is an explanatory illustration, not a screenshot of the running application.
```

## 修正プロンプト（同じツールによる画像編集）

```text
Edit the attached TableCast PoC architecture concept image. Keep its typography, Japanese text, visual style, all nodes, positions and existing connections essentially unchanged. Correct ONLY these two topology issues:
1. The staff phone labeled 店員の端末 is unconnected. Add a thin BLUE directed connector from the right edge of that phone to the Web node. Route it in the free corridor to the left of LiveKit and Web, then join the existing blue 画面操作 route before the Web node. Label its route "画面操作" if needed. Where it crosses the teal guest WebRTC route, draw a clear bridge/jump so the routes are NOT joined. The staff must NOT connect to LiveKit.
2. The pale blue enclosure titled Cloudflare Workers should enclose ONLY Web and 共通API, not the D1 cylinder or DO node. End the enclosure just to the right of the API node, before the D1 and DO nodes. Keep API -> D1 保存 and API -> DO 状態通知 connections, but those arrows should leave the Workers enclosure. Preserve the external voice services grouping.
Everything else, including title, lower voice loop, footer, device illustrations and labels should remain as is. Maintain wide 16:9 composition and readable Japanese lettering.
```
