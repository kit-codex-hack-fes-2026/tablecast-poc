# 商品画像の配信・表示検証

[UI仕様](ui.md) / [Issue #166](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/issues/166)

## 条件と対象

2026-09-14、基準は`0150bf6bd396c3b4774d48823d9da68e2117ead7`。同じ専用worktreeで変更後と基準の画像実装をそれぞれbuildした。変更後は本PRの実装差分、測定時は未コミット。実行環境のrelease識別子は既存E2Eの`tablecast-e2e`であり、公開配備SHAではない。

Playwright 1.63.0 / Chromium、1024×768 CSS px、DPR 2、macOSのローカルWeb/API Workers、実D1・R2・Images・Cache APIを使った。外部モデル通信・モデルtoken使用は0。Service Workerを停止し、ペアリング中の画像通信だけをabortした後、介入を解除してcold 1回と同じブラウザーでのreload 2回を採取した。画像通信の完了と描画フレームを待ってResource Timing、LCP、CLSを採取する。未対応のブラウザーではLCP/CLSを0とせずnullにする。

カタログは既存の商品写真を再利用した24件と120件。公開APIの下書き・検証・承認を通して隔離DBへ投入する。120種類の異なる画像を用意した試験ではない。初期viewportとブラウザーの遅延読込範囲に入った異なる画像URLは両条件とも22件。全リストのスクロール完了時の転送量とは区別する。

## 結果

| 商品数 | 実装   | 選択幅 | cold画像転送 | reload 1 / 2の転送 | cold LCP | reload 1 / 2 LCP | 最大CLS |
| ------ | ------ | ------ | ------------ | ------------------ | -------- | ---------------- | ------- |
| 24     | 変更前 | 640px  | 654,910 B    | 0 / 0 B            | 440ms    | 156 / 68ms       | 0.00495 |
| 24     | 変更後 | 512px  | 474,450 B    | 0 / 0 B            | 512ms    | 100 / 68ms       | 0       |
| 120    | 変更前 | 640px  | 654,910 B    | 0 / 0 B            | 220ms    | 52 / 56ms        | 0       |
| 120    | 変更後 | 512px  | 474,450 B    | 0 / 0 B            | 176ms    | 52 / 52ms        | 0       |

一覧は230×230 CSS px。必要な約460pxに対し、512px候補の追加と`sizes="auto"`によって画像転送が27.6%減った。実画像の選択・カート追加まで確認し、詳細は476×476px、カートは64×64pxだった。詳細の優先読込は可変ペインの最大幅を見積もり、一覧・カート・選択肢は遅延読込を維持する。

reloadの転送0は変更前にも成立しており、新規成果とはしない。ブラウザーキャッシュを持たないAPI clientから表示済みの同じ画像・幅を3回取得すると、変更後は3回ともHIT、各16,240 Bだった。変更前は各22,000 Bで、routeが毎回変換へ進む。変更後のHIT経路はImages bindingへ入らないため、この3要求の再変換を3回から0回へ減らした。別途、API統合でMISS→HIT、幅分離、旧ETagを付けた画像差替え、削除後の404、既存304を確認した。実Cloudflareの課金カウンターから変換回数を測った結果ではない。

LCPは24件条件で遅くなり、120件条件では速くなった。cold 1標本だけでLCPの改善・悪化を断定しない。ローカルの起動・SSR・変換待ちも含む値であり、公開環境での速度改善の保証には使わない。初回画像転送500,000 B以下、再訪0 B、取得可能なCLS 0.1未満を同じ実API E2Eの予算に置いた。

## Placeholderと周辺画像

`blurDataURL`の生成・保存元は呼出し側の静的素材である。Storyでは24pxのぼかしSVG data URLを事前定義した。追加HTTP要求は0件、未指定の既存カタログにはpayloadの追加も0。指定する場合だけdata URL文字列がHTML/JSの転送へ加わる。目安を1KB以下とし、一律自動生成・DB列追加・SSR画像解析は採用しない。読込前後の実画面と動画はPRへ添付する。表示待ちの見た目の改善であり、本画像の完了やLCPを早めたという結果ではない。

Unpic 1.0.2の`unstyled`は背景styleも抑止する。公開Image propsにはstyle/refもないため、ネイティブspanのCSS変数とTailwind utilityで背景・比率を渡し、同じspanでhydration前の画像完了を確認する。背景は成功・失敗時に消す。WebKitでは遅延画像が読込開始前にも`complete=true`を返したため、完了判定には`currentSrc`の選択済みも必要とする。これにより選択肢画像の早すぎる失敗表示を防ぐ。画像のBrowserテスト4件をChromium/WebKit双方で実行する。透過SVG、未指定、失敗、画像なし、SSR完了後のhydrationをVitest Browser/Storybookで確認した。[Unpicの背景仕様](https://unpic.pics/img/react/#background)

店舗・ユーザー画像は商品画像と異なり、`/api/avatars/:key`で原本をimmutable配信する。既存seedのWebPは店舗3枚が31,430〜38,264 B、ユーザー9枚が31,510〜63,524 B。手動アップロードは既存の1MB上限がある。今回は原本配信を変更せず、商品キャッシュによる削減値に混ぜない。

WebKitでも24件・120件の実画像・寸法・詳細・カート操作とAPIのHITを確認した。WebKitのResource Timingはbody/transferがすべて0、CLSは未提供だったため、転送0やCLS 0の成功とは扱わない。転送量の予算は値を取得できたChromiumで保証する。

## 再現と未実施範囲

```sh
bun run --cwd apps/api test --project bindings test/media.test.ts
bun run --cwd apps/web test:browser src/components/product-image src/components/menu-option-image.browser.test.tsx src/features/kiosk/menu.stories.tsx
bun run --cwd apps/web test:e2e tablecast-image-performance.spec.ts --project=tablecast-chromium --workers=1
```

E2EはJSONを`tablecast-image-metrics`添付と標準出力へ、一覧・詳細・カートのPNGをtest-resultsへ保存する。基準測定は同じ計測処理でbyte予算追加前に行った。

Cache APIはデータセンターごとの保存であり、MISS時の同時要求を一つへ束ねる仕組みではない。実Cloudflare previewのhit率・変換課金、ネットワーク制限下の複数cold標本、iPad実機、全リストスクロールは未実施。ローカル成功をこれらの代用にしない。[Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)、[Images binding](https://developers.cloudflare.com/images/optimization/binding/)
