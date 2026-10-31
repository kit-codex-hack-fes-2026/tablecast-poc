---
name: tablecast-web
description: TableCastのWeb画面・SSR・データ取得・フォーム・日英UIを実装・変更する。
---

# TableCast Web

利用者の操作・表示は[UI仕様](../../../docs/ui.md)、配置・依存は[構成](../../../docs/architecture.md)の該当箇所を確認する。表現を設計するときは`animate`・`emil-design-eng`を使い、業務・アクセシビリティ仕様を優先する。

## 指示と変更範囲の照合

- 着手・再開・委任時に、対象画面の最新の具体的指示、残す要素、変更禁止事項を確認する。訂正された古い方針を引き継がず、サブエージェントにも現在の制約を渡す。
- 全体の統一・簡素化・無彩色化を、個別に指定された表現や機能を削除する許可と解釈しない。音声ボタンの虹色リングのような具体的指定は、それを変更する明示指示があるまで維持する。デザインskillの推奨や自分の好みで上書きしない。
- 削除・非表示・統合・共通部品への置換の前に、失われる表示・操作を指示と照合する。依頼されていない削減は行わず、許可済みの変更をその範囲で進める。
- 完了前は変更差分を具体的指示と照合する。テスト成功や規約の追記を指示追従の代わりにせず、指定から外れた変更を戻し、未完了を完了扱いしない。

## 取得と状態の寿命

- routeはloaderとページ合成、featureは業務状態・操作、`components/ui`は業務非依存部品を所有する。共通部品はfeatureへ逆依存せず、APIは公開schema・Hono推論型・既存clientから使う。
- loaderから表示まで取得経路を追い、必要な初期queryをloaderで取得する。SSRはリクエスト単位のQueryClientを引き継ぎ、Cookie・cacheをリクエスト間で共有しない。取得済みデータを渡し、loader・component・認証処理で同じ取得を重ねない。
- 初回読込と再取得を区別する。初回はpending/error境界を使い、再取得の失敗では取得済み画面と入力を保持して再試行できるようにする。読込中・失敗・成功した0件を同じ状態にしない。
- 性能は初期表示までの依存と待ち時間で判断し、SSR対応だけで高速化済みとしない。独立した取得の直列化や不要なhydration後の再取得を確認する。

## 部品と操作

- 背景と操作部品の色を混同しない。[配色規約](../../../docs/ui.md#配色)の用途区分を確認し、画面・カード・見出しの背景はRadix ColorsのStep 1・2を使う。

- フォームは既存`components/form`のTanStack Form連携を使い、項目エラー、入力保持、非同期submit、mutationの失敗表示を揃える。
- 標準Tailwind utilityを優先し、同じ意味の見た目は既存Tailwind Variantsの`tv`・`VariantProps`へまとめる。業務状態を持つ部品をUIプリミティブへ移さず、未使用のvariantや独自フォーム・query wrapperを増やさない。
- Motionは既存`MotionProvider`、共通の操作結果は`ActionFeedback`を使う。日英の支援技術向け表示、画像の寸法予約、reduced motionを確認する。

## 変更範囲に応じた確認

表示・入力・保存失敗・409・再試行・query更新は、既存Storybookか実feature・QueryClient・メモリーRouterを接続するVitest Browserで確認する。HTTP・通知など外部境界だけを固定し、本番のhook・client・状態遷移を外さない。focus・layout・日英・viewportの分岐を全構成E2Eで反復しない。

E2Eの追加・移行では[所有層と代表経路](../../../docs/testing.md#保証の所有層とe2eへの昇格)を先に照合し、実SSR・Cookie・Service Binding・SW・外部redirect等でしか観測できない結果を示す。下位で保証済みなら追加せず、不足を補ってから上位の重複を除く。APIを差し替えたブラウザー成功を実DBの保証とせず、実routeのloader・hydrationをメモリーRouterで保証したとしない。

並列の資源所有と復元は[fixture契約](../../../docs/testing.md#並列実行と順番に依存しないfixture)に従う。Browserのiframe隔離をCookie/storage初期化とせず、永続化を試さないproviderはpersistを止める。caseごとにQueryClient・DOM・通知・時計・mockを解放し、deferredは失敗時も解放して進行中の処理を終えてからcleanupする。

Web実装ではworkspaceの`lint`・`typecheck`と関連テストを実行する。操作・focus・layoutは`test:browser`等の実ブラウザー、SSR・認証・注文の最終配線は代表E2Eで確認する。部品のみの変更に全E2Eを一律に要求しない。保証の分担は[テスト戦略](../../../docs/testing.md)、PRの実動作証拠は[Issue・PR skill](../github-issue-pr-ops/SKILL.md)を使う。

LP・ログイン・MCP導入案内は環境共通のUIを使う。MCP名は`tablecast`、案内URLは現在のoriginの`/mcp`とし、認証ロジックの環境差分と区別する。LPは店舗向け管理アプリ`/admin/live`を主導線にし、注文端末`/pair`と客向け会員アプリ`/member`を案内する。実物と異なる公開デモを再追加せず、管理者向けの既存会話注文デモと区別する。

LPの改修では共通のブランド・書体・色・ボタン・LanguageSwitchを使い、見出しのsemibold既定値を独自に軽くしない。構成をLP向けに変える場合も、操作部品を独自の見た目へ置き換えない。製品の説明には現在の実画面を使い、スクリーンショットと操作可能なデモを区別する。生成した利用シーンの出典は開発者向け資料へ記録し、実績を創作しない。LP上の制作方法の但し書きは要求しない。ヘッダーのログインと店舗向けの主導線を保ち、装飾の連番と冗長な補足ラベルを追加しない。

LPの利用ケースやAgent Pluginの依頼例を変えるときは[製品の価値と検証経路](../../../docs/use-cases.md)から実際のtool・schema・権限を照合する。客向け音声操作と店舗管理MCPを混同せず、具体的な資料・制約・出力・下書きと公開の境界まで依頼を組み立てる。READMEでは体験を支える設計と検証への入口を示し、自然言語依頼の完遂をtool単体テストの成功で代替しない。
