# 保存済み技術紹介の実装根拠

既定台本 `projects/tablecast-main-rerecord.json` の技術紹介は、収録版 `7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919` の構成・実装・検査結果を説明する保存作例である。現在のPRの実装や検査結果を説明するものではない。

この版ではLiveKit・Python Agent・Mastra・RealtimeとInworld TTSを使っていた。現行のGPT-Live・Responses delegationとは異なる。現行仕様は [音声接続仕様](../../../docs/voice/integration.md) を参照する。

## 場面ごとの出典

削除済みの実装を稼働コードとして戻さず、収録当時のコミットへ固定した出典を保持する。生成時はこの文書を入力としてハッシュ化する。GitHubへのアクセスや古いコードの取得は生成処理に含めない。

| 場面                     | 収録版の出典                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 課題と成果               | [製品仕様](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/docs/product.md)、[注文処理](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/apps/api/src/modules/orders/service.ts)、[卓の変更](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/apps/api/src/modules/tables/mutations.ts)                        |
| 全体構成・音声の役割分担 | [構成仕様](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/docs/architecture.md)、[音声接続](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/docs/voice/integration.md)、[Realtime接続](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/livekit/src/tablecast_livekit/realtime.py)、上記の注文処理と卓の変更 |
| 注文が確定する条件       | [音声Agent](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/livekit/src/tablecast_livekit/agent.py)、上記の注文処理と卓の変更                                                                                                                                                                                                                                                                                              |
| 条件ごとの検査結果       | [注文テスト](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/apps/api/test/orders.test.ts)、[収録版の検証記録](tablecast-main-video-validation.json)                                                                                                                                                                                                                                                                       |
| 今後の確認               | [収録当時の受入条件](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/7d6adc7f9aa813ecdb0f3e5b5248c4ca85c8c919/docs/acceptance.md)                                                                                                                                                                                                                                                                                                                                   |

## 更新の境界

Issue #139では保存済み音声と図の再生成を維持する。映像内の各章に収録版と旧構成の注記を表示し、Actionsサマリーでも現在の構成の説明ではないことを知らせる。図・発話・録画を最新化するときは [制作手順](../WORKFLOW.md) に従って全体を更新し、当時のテスト件数や成功表示を現行版の結果として転用しない。
