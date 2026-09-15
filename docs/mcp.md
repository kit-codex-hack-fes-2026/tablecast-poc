# 店舗ChatGPTとMCPによる設定

[索引](README.md)

## 役割

店舗のChatGPTがメニュー画像・PDF・表を読み、日英コンテンツを生成し、TableCastのRemote MCPへ下書き登録する。
TableCast内にOCR・翻訳Agent・別の設定チャットを作らない。管理画面には確認、差分、必要な手動修正と公開を用意する。
UIそのものの翻訳はWebのメッセージファイル、商品・プラン・キャストはDBにある日英コンテンツを正本にする。

### 選択肢の条件式

`update_draft`のoptionには任意の`conditions: { version: 2, requires, excludes }`を渡せる。式は`{kind:"option", optionId}`、`{kind:"and"|"or", children}`、`{kind:"not", child}`で、条件なしは`null`とする。旧`requires` / `excludes`配列を持つ選択肢も混在できるが、一つの選択肢で新条件と空でない旧配列を併記しない。式は深さ8、各AND/ORは2〜8子、式64節、商品1,024節、設定65,536節まで。`get_configuration`のJSON Schemaは深さごとの参照を含む有限schemaを返し、節数合計はAPIが追加検証する。

取得した`conditions`を省略して全体保存すると`CONFIGURATION_FORMAT_UNSUPPORTED`となる。条件を削除するときは`version:2`と両式の`null`を明示する。実際の選択肢・商品削除は可能。既存draft・releaseの一括移行やDB migrationは不要。新形式を保存した環境へ旧APIを戻す場合は、先に条件を互換形式へ戻す移行が必要となる。

## 管理できるもの

カテゴリ、商品、価格、説明、読上げ名、検索alias、画像参照、カスタマイズ、食べ飲み放題プラン、キャストの自由文指示を設定する。
日英で商品ID、価格、在庫、ルールを複製しない。各言語のdisplayName・speechName・説明だけを分ける。
原資料から不明な原材料・アレルゲン・価格・対象プランは未確認とし、ChatGPTの推測で確定させない。
生成画像は明示的な商品イメージとして扱い、実際の商品写真と偽らない。PoCで独自画像生成APIを必須実装しない。

商品とカスタマイズ選択肢は同じ `imageKey`（既存 `/media/` のキー、未設定は `null`）と `imageKind`（`photograph` / `illustration`、省略時は `illustration`）を持つ。選択肢の説明は既存 `text.ja.description` / `text.en.description` を使う。画像フィールドのない旧設定は読み込み時に既定値を補い、DB migration は不要。既存 `get_configuration` / `update_draft` の設定 JSON で扱い、保存・検証だけでは公開せず、人間の公開承認後に客画面へ反映する。画像の送信・生成用 MCP tool は追加しない。

## ツールのまとまり

初期は次の程度で足りる。型を一つの万能JSONにして検証を失わず、同じ意味の細粒度ツールを大量に増やさない。

| ツール群       | 用途                                           |
| -------------- | ---------------------------------------------- |
| 設定取得       | 公開schema、対応言語、現在の公開設定           |
| 画像取込       | 商品画像を保存し、出所付きの画像参照を返す     |
| 下書き作成     | 公開版を元に一つの変更セットを作る             |
| 商品バッチ更新 | カテゴリ、商品、カスタマイズ、日英テキスト     |
| プラン更新     | 店舗依存ルールを登録する                       |
| キャスト更新   | 日英の標準voice・会話指示・自由文の演技方針    |
| 下書き検証     | 不足、参照不整合、価格、ルール、読上げ名を検査 |
| 差分取得       | 現在の公開版との差分を説明可能な形で返す       |
| 公開・破棄     | 承認後の公開または不要な下書きの破棄           |

API側の既存操作をMCPから呼ぶ。MCP専用の価格計算・別DB・認可系統を作らない。
個別ツール名や最終schemaは、最初の実装で実際の操作単位に合わせて固定する。

## 商品画像の取り込み

ChatGPTで生成・添付した画像は`upload_image.file`へ渡す。`_meta["openai/fileParams"]: ["file"]`を宣言し、ChatGPTが渡す`{ download_url, file_id, mime_type?, file_name? }`を受け取る。4フィールドをschemaへ宣言し、download_url/file_idだけを必須にする。[OpenAI公式のファイル入力](https://developers.openai.com/plugins/reference#define-file-inputs)に従い、UI widgetや追加SDKは要求しない。

Base64を扱うクライアントはfileの代わりに画像ファイルのBase64を`data`、実形式を`mimeType`へ渡す。fileとの同時指定を拒否する。PNG・JPEG・WebP、元ファイル5MiB以下、1600万画素以下に対応する。Base64入力へdata URL、ローカルパス、添付ID、URL文字列を渡さない。画像生成からの実受渡しは利用クライアントでも確認し、未接続や画像未生成を検証済みと報告しない。

ダウンロード先はHTTPSのoaiusercontent.comおよびそのsubdomain、Azure Blobの`<account>.blob.core.windows.net`に限定する。任意port・URL内の認証情報を拒否し、最大3回のredirectでも毎回配信先を再検証する。TableCastの資格情報を転送しない。15秒の期限と5MiBの本文読取上限を適用し、取得失敗時の署名付きURLをtool応答や保存設定へ漏らさない。署名の期限切れはChatGPTで新しいfile参照を取得して再送する。

`imageKind`は`photograph`または`illustration`、`imageSource`は`{ generated: boolean, description: string }`を必須とする。生成画像は`generated: true`かつ`illustration`にし、実写真と偽らない。descriptionには店舗が提供した写真・資料名、生成した商品イメージなどの出所を500文字以内で記録する。秘密情報、署名付きURL、個人情報を入れない。これは利用者が申告した出所であり、生成モデルの証明や権利確認の代わりにはならない。

取込には現在のowner/admin権限と`tablecast:write` scopeが必要である。既存のCloudflare Images bindingで実形式と寸法を確認し、縦横1600px以内の静止WebPへ変換してR2へ保存する。画像バイトや元ファイルのメタデータをログ・tool応答へ返さない。取込済み画像はURLを知る人へ公開配信されるため、非公開資料そのものを渡さない。

1. `get_configuration`と`create_draft`で対象店舗と現在の設定を確認する。
2. `upload_image`へfile参照または実画像のBase64と出所を渡す。画像生成・OCRはクライアント側で行う。
3. 応答の`imageKey`・`imageKind`・`imageSource`を対象商品の同名フィールドへ設定し、他の商品・価格・日英データを保持した`configuration`を`update_draft`へ渡す。`url`は確認用であり、商品設定へ追加しない。
4. `validate_draft`・`get_draft_diff`で価格・安全情報・画像と出所を確認し、`request_publication`の管理画面で人が公開する。画像の取込だけでは公開メニューを変更しない。

同じ店舗・画像・出所を再送すると同じキーを返し、保存済み画像を上書きしない。アップロード応答の消失時は同じ入力を再送する。下書き更新の競合時は`get_draft_diff`で現在版を読み、保存済みキーを使って変更を組み直す。別店舗の取込画像、存在しない画像、出所や生成種別の改ざんは下書き保存と公開直前に拒否する。従来のseed画像キーは引き続き利用できる。下書き破棄は画像削除を行わない。

Web用には`POST /api/admin/stores/:storeId/images`でmultipartの`image`（ファイル）と`metadata`（imageKind/imageSourceのJSON文字列）を受け取り、同じmedia serviceを呼ぶ。画像入力のあるこの経路と`/mcp`だけHTTP本文上限を8MiBとし、他のAPIは2MiBのままとする。新しいWebアップロードUI、任意サイトの画像収集、組織共通ロゴのMCP変更はこの操作に含めない。

## 架空店の試作

試しに二郎系ラーメン店を設定して、名前・メニュー・画像を考えて、マシマシ対応という依頼は、架空の設定値を提案して下書きへ保存する依頼として扱う。実店舗の未確認情報と区別し、店名は`configuration.storeName`、麺量・野菜・ニンニク・アブラ・カラメは既存のsingle modifierとpriceDeltaで表す。商品IDとグループ・選択肢IDは店舗の既存設定と衝突させない。価格・売切状態・日英コンテンツ・接客文を設定し、アレルゲンの根拠がなければunknownを維持する。

`storeName`は省略時に現在名を保持し、指定時は差分に現在名と提案名を表示する。検証済み下書きの公開と同じ条件付きD1 batchで店舗名を変更する。新しい組織の作成、組織共通ロゴの変更、公開の自動承認は行わない。下書きのみの依頼はreadyで止め、実際のdraftId・版と未完了部分を示す。

## 下書きと承認

設定は `draft → ready → published` を基本とし、検証失敗はdraftにエラーを付けて返す。必要のない多数の中間状態を作らない。
公開には検証済みdraft版、現在の公開版との一致、公開権限、明示承認、冪等性が必要である。
顧客の注文と同様、LLMが `approved: true` と書くだけで承認の証明にしない。
ChatGPTの書き込み確認とTableCastの権限・対象版検証を組み合わせる。厳密な担当者確認が必要な設定は管理画面の公開ボタンを使う。
公開設定への即時CRUDをLLMへ渡さない。価格・安全情報の変更を明瞭に示す。

## キャスト設定

[既定ペルソナ](voice/speech.md) を初期値とする。店舗の自由文は会話表現に限り、システムの認可・確認・安全制約より下位に置く。
voiceはGPT-Liveの標準voiceを選ぶ。Custom Voiceやreference uploadの項目は作らない。
管理者が日本語で説明した演技方針をChatGPTが英語steering向けに整えることはよいが、編集画面の説明や文書を英語固定にしない。

## 認証と開発

公開はWebと同一オリジンの `/mcp` とし、Hono側の公式MCP/OAuth機能を使う。実装版が要求するOAuth discoveryとtransportを確認する。
組織・店舗・権限を認証コンテキストから確定し、tool引数の店舗IDだけに頼らない。
ローカルは[CodexのMCP接続手順](codex-plugin.md#ローカル接続)でOAuthとtoolの実行を確認する。プロトコルの診断にはMCP Inspectorも使える。ChatGPTのクラウドからの到達には対応するトンネルまたはHTTPS公開が必要で、localhostだけでは接続できない。[S15](sources.md#s15)
実際の店舗ChatGPTプラン・ワークスペースで書き込みMCPが使えることをデモ前に確認する。過去のプラン別制限を固定仕様として書き写さない。
テストだけの認証無効化や本番Secretの埋込みで接続を成立させない。

## stagingでの検証

stagingの接続先は`https://tablecast-staging.kit-codex.workers.dev/mcp`、クライアント名は`tablecast-staging`とする。Web・模擬ログイン・同意はCloudflare Accessの対象で、機械通信のMCP・discovery・DCR・token・revokeだけAccessを除外する。OAuth・PKCE・scope・店舗認可とtoolの入出力は本番と同じ契約を使う。接続と再認可は[plugin手順](codex-plugin.md#stagingのremote-mcp確認)、保持・全体リセットと検証SHAは[配備手順](deployment.md#stagingとreleaseの運用)を参照する。
