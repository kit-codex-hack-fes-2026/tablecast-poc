# 店舗ChatGPTとMCPによる設定

[索引](README.md)

## 役割

店舗のChatGPTがメニュー画像・PDF・表を読み、日英コンテンツを生成し、TableCastのRemote MCPへ下書き登録する。
TableCast内にOCR・翻訳Agent・別の設定チャットを作らない。管理画面には確認、差分、必要な手動修正と公開を用意する。
UIそのものの翻訳はWebのメッセージファイル、商品・プラン・キャストはDBにある日英コンテンツを正本にする。

### 選択肢の条件式

`update_draft`のoptionには任意の`conditions: { version: 2, requires, excludes }`を渡せる。式は`{kind:"option", optionId}`、`{kind:"and"|"or", children}`、`{kind:"not", child}`で、条件なしは`null`とする。旧`requires` / `excludes`配列を持つ選択肢も混在できるが、一つの選択肢で新条件と空でない旧配列を併記しない。式は深さ8、各AND/ORは2〜8子、式64節、商品1,024節、設定65,536節まで。`get_configuration`のJSON Schemaは深さごとの参照を含む有限schemaを返し、節数合計はAPIが追加検証する。

食事制限の設定も`get_configuration`・`update_draft`・`validate_draft`・`get_draft_diff`を使う。`get_configuration.foodClassification`に日本の29品目の固定ID・日英名称・区分・参照版を返す。`foodInfo`の固定部分、具材と調理条件、標準構成、選択肢の`foodChanges.add/remove`、各品目の含有・不使用・不明、4食事区分と`reasons`・`halalCertification`・`crossContactSources`のenumは全て同じconfigurationで保存できる。自由文の根拠や29品目外のアレルゲンIDは受け付けず、既知の判定には理由IDが必要で、参照切れ・重複・同一選択肢で同じ具材を追加かつ除去する設定は公開できない。増減の解除は空配列を明示する。詳細な意味は[食事制限仕様](product.md#アレルゲンと食事制限)に従う。

取得した`conditions`を省略して全体保存すると`CONFIGURATION_FORMAT_UNSUPPORTED`となる。条件を削除するときは`version:2`と両式の`null`を明示する。実際の選択肢・商品削除は可能。既存draft・releaseの一括移行やDB migrationは不要。新形式を保存した環境へ旧APIを戻す場合は、先に条件を互換形式へ戻す移行が必要となる。

## 管理できるもの

卓上ゲームは`get_game_spec`で契約を取得し、`register_game`・`validate_game`で下書き登録と検証を行う。管理画面で人が試遊して承認する。ゲームの契約とツール一覧は[ゲームプラグイン仕様](game-plugins.md)を参照する。

カテゴリ、商品、価格、説明、読上げ名、検索alias、画像参照、カスタマイズ、食べ飲み放題プラン、キャストの自由文指示を設定する。
日英で商品ID、価格、在庫、ルールを複製しない。各言語のdisplayName・speechName・説明だけを分ける。
原資料から不明な原材料・アレルゲン・価格・対象プランは未確認とし、ChatGPTの推測で確定させない。
生成画像は明示的な商品イメージとして扱い、実際の商品写真と偽らない。PoCで独自画像生成APIを必須実装しない。

商品とカスタマイズ選択肢は同じ `imageKey`（R2のキー、未設定は `null`）と `imageKind`（`photograph` / `illustration`、省略時は `illustration`）を持つ。選択肢の説明は既存 `text.ja.description` / `text.en.description` を使う。既存 `get_configuration` / `update_draft` の設定 JSON で扱い、保存・検証だけでは公開せず、人間の公開承認後に客画面へ反映する。画像の送信・生成用 MCP tool は追加しない。

## ツールのまとまり

初期は次の程度で足りる。型を一つの万能JSONにして検証を失わず、同じ意味の細粒度ツールを大量に増やさない。

| ツール群       | 用途                                                       |
| -------------- | ---------------------------------------------------------- |
| 設定取得       | 公開schema、対応言語、現在の公開設定                       |
| テーマ制作仕様 | 素材の生成要件・推奨寸法・配置schemaを返す                 |
| 画像取込       | 商品・ロゴ・装飾・チラシを保存し、出所付きの画像参照を返す |
| 下書き作成     | 公開版を元に一つの変更セットを作る                         |
| 商品バッチ更新 | カテゴリ、商品、カスタマイズ、言語別テキスト               |
| プラン更新     | 店舗依存ルールを登録する                                   |
| キャスト更新   | 日英の標準voice・会話指示・自由文の演技方針                |
| 下書き検証     | 不足、参照不整合、価格、ルール、読上げ名を検査             |
| 差分取得       | 現在の公開版との差分を説明可能な形で返す                   |
| 公開・破棄     | 承認後の公開または不要な下書きの破棄                       |

API側の既存操作をMCPから呼ぶ。MCP専用の価格計算・別DB・認可系統を作らない。
個別ツール名や最終schemaは、最初の実装で実際の操作単位に合わせて固定する。

## 商品画像の取り込み

ChatGPTで生成・添付した画像は`upload_image.file`へ渡す。`_meta["openai/fileParams"]: ["file"]`を宣言し、ChatGPTが渡す`{ download_url, file_id, mime_type?, file_name? }`を受け取る。4フィールドをschemaへ宣言し、download_url/file_idだけを必須にする。[OpenAI公式のファイル入力](https://developers.openai.com/plugins/reference#define-file-inputs)に従い、UI widgetや追加SDKは要求しない。

Base64を扱うクライアントはfileの代わりに画像ファイルのBase64を`data`、実形式を`mimeType`へ渡す。fileとの同時指定を拒否する。PNG・JPEG・WebP、元ファイル5MiB以下、1600万画素以下に対応する。Base64入力へdata URL、ローカルパス、添付ID、URL文字列を渡さない。画像生成からの実受渡しは利用クライアントでも確認し、未接続や画像未生成を検証済みと報告しない。

ダウンロード先はHTTPSのoaiusercontent.comおよびそのsubdomain、Azure Blobの`<account>.blob.core.windows.net`に限定する。任意port・URL内の認証情報を拒否し、最大3回のredirectでも毎回配信先を再検証する。TableCastの資格情報を転送しない。15秒の期限と5MiBの本文読取上限を適用し、取得失敗時の署名付きURLをtool応答や保存設定へ漏らさない。署名の期限切れはChatGPTで新しいfile参照を取得して再送する。

`imageKind`は`photograph`または`illustration`、`imageSource`は`{ generated: boolean, description: string }`を必須とする。生成画像は`generated: true`かつ`illustration`にし、実写真と偽らない。descriptionには店舗が提供した写真・資料名、生成した商品イメージなどの出所を500文字以内で記録する。秘密情報、署名付きURL、個人情報を入れない。これは利用者が申告した出所であり、生成モデルの証明や権利確認の代わりにはならない。

取込には現在のowner/admin権限と`tablecast:write` scopeが必要である。既存のCloudflare Images bindingで実形式と寸法を確認し、縦横1600px以内の静止WebPへ変換してR2へ保存する。画像バイトや元ファイルのメタデータをログ・tool応答へ返さない。取込時に実寸とBlurHashをD1へ保存し、画像URLのネットワーク取得には店舗の認可を要求する。設定JSONへBlurHashを保存せず、MCPの設定取得にも画面用の`imageAssets`を付けない。取得済み画像は端末キャッシュで再利用するため、権限失効後の即時消去は保証しない。

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

stagingの接続先は`https://tablecast-staging.kit-codex.workers.dev/mcp`、クライアント名は`tablecast-staging`とする。Web・模擬ログイン・同意・MCPはCloudflare Access資格なしで公開する。OAuth・PKCE・scope・店舗認可とtoolの入出力は本番と同じ契約を使う。接続と再認可は[plugin手順](codex-plugin.md#stagingのremote-mcp確認)、保持・全体リセットと検証SHAは[配備手順](deployment.md#stagingとreleaseの運用)を参照する。

### 接客方針の文書形式

`cast.instructions.ja/en` は旧文字列と版1の制限されたTiptap文書のunion。文書を保存する `update_draft` 呼出しでは `instructionFormatVersion: 1` を付ける。省略した旧クライアントは文書を含む下書きを更新できず、競合として拒否される。schemaと本文投影・上限はGUIと共通。[保存契約と展開条件](prompt-editor-design.md)を参照する。

## Squareの商品対応

POS設定はメニューの下書きとは別に保存する。owner/adminが`tablecast:read`で設定・カタログ・端末を取得し、`tablecast:write`で対応を保存する。GUIと同じPOS serviceが店舗境界、接続環境、会計中の固定、設定revisionを検証する。

| tool                | 入出力                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_pos_settings`  | sectionはitemsまたはmappings、limitは1〜100（既定50）、cursorで継続する。storeId・settingsUrl・接続・revision・total・nextCursorと、指定sectionのitemsまたはmappingsを返す。未接続でも設定画面を案内できる |
| `get_pos_catalog`   | 任意のlocationId・limit・cursorを受け取り、kindがlocation/product/optionのentriesとtotal・nextCursor・issuesを返す。optionのproductIdは親variationを示し、原文名・通常価格・販売状態を保持する             |
| `list_pos_devices`  | 任意のlocationId・limit・cursorを受け取り、端末ID・名前・locationIdとcanPair・total・nextCursorを返す。端末の登録は行わない                                                                                |
| `save_pos_mappings` | expectedRevision・locationId・deviceId・全mappingsを受け取り、storeId・settingsUrl・保存後connection・mappingCountだけを返す                                                                               |

settingsのitemsはkind・id・productId・登録済み各言語名・価格・販売状態に限定し、画像や全configurationを複製しない。section:mappingsも最後まで取得し、itemsの現存local IDと突合する。limit・section・locationIdを変えずにnextCursorを辿り、POS_CURSOR_STALEなら先頭から再収集してrevisionも読み直す。各pageは共有serviceを再読取するため、ページ化だけでDB処理量が一定になるとは保証しない。

agentはTableCastの登録済み各言語名、Squareの登録名・itemName・variationName、容量、通常価格を照合し、確かめられた商品からvariationへ、その子のカスタマイズからmodifierへ対応付ける。Squareの名前は日本語登録なら英語UIでも原文を維持する。別の親に属するmodifierや不一致の価格を名前だけで対応済みにしない。

保存は最大5,000件の全置換であり、現存するlocal IDと取得候補IDに一致する既存対応は依頼範囲外も含める。分割保存で追加する方式ではない。廃止local IDや消失したSquare IDは保存時に拒否されるため、該当行を区別し、依頼範囲では修正候補または未対応として明示する。範囲外で維持できない対応を黙って解除しない。親modifierの所属と価格は会計前のquoteで厳密に照合する。共有local optionはkindとlocalIdの組で一件にし、別商品での外部modifier再利用を妨げない。未対応行は配列へ含めず、曖昧な行だけ保留する。競合時は最新revisionを再取得して差分を組み直し、保存後も設定を再取得して確認する。接続・再認証・接続解除・端末登録・会計は設定画面で行い、今回のMCP toolには含めない。対応範囲はJPYの税込10%で、実接続・実決済の確認は設定保存の検証と分ける。

## 店舗統計

`get_statistics` はowner/admin向けの読取りtoolで、`tablecast:read` により概要・商品・カスタマイズの統計を取得する。from/toで指定した期間内に閉卓した通常来店を対象にする。詳細は[指標・期間・ページング](statistics.md)を参照する。分析だけの依頼で下書きを作らず、採用された設定変更に既存の下書きtoolを使う。

## 会員特典の管理

`get_point_policy` / `set_point_policy`で将来の来店向けポイント設定を扱う。`list_coupon_rules` / `save_coupon_rule`は券面画像と日英条件を含む発行ルール、`list_reward_members`は発行先の会員ID・表示名、`list_issued_coupons`は発行済み券の状態をページ取得する。`issue_coupon`は手動ルールから冪等キー付きで発行し、`revoke_coupon`は未使用券を理由付きで取り消す。

会員検索は会員ID・表示名と`nextCursor`だけを返す。発行済み券は券ID・表示名・状態・発行日時・発行時の条件と`nextCursor`を返す。MCPの出力境界でこれらを明示的に選び、管理HTTP用の会員メール・画像・入会日時をモデルへ渡さない。管理画面の人物表示に必要なHTTP応答は維持する。

券面は既存の`upload_image`で取り込み、返された画像キーと出所を保存する。書込みには既存の店舗管理権限を検証し、GUIと同じAPI serviceを通す。発行済み券の条件は後から変更しない。会員の個人記憶を一覧・検索するMCP操作は設けない。

## テーマ・店舗ロゴ・チラシ

`get_configuration`のschemaに`branding.logo`・`appearance`・`banners`を含む。画像は既存の`upload_image`で登録し、返されたキー・種別・出所に日英のaltを付けて設定する。店舗ロゴは組織共通ロゴとは別である。テーマ画像、ロゴ、チラシの画像所有と出所は下書き保存・公開時に検証する。

`update_draft`で設定を保持しながら変更し、`validate_draft`・`get_draft_diff`・`request_publication`を使う。禁止CSSは行・列と理由を含む入力エラー、欠損商品は既存のPRODUCT_NOT_FOUNDを返す。領域IDとバナーIDは重複させない。詳しい制作例は製品pluginのtablecast-theme skillを参照する。テーマ文字列と画像を音声の業務tool結果へ複製しない。

画像を使うテーマ制作では`get_configuration`と`get_theme_spec`を取得する。後者は接続先店舗、現行テーマschema、背景・ロゴ・チラシの生成要件と推奨寸法、公開部品、デザイン編集URLを返す読取り専用tool。画像生成はクライアントの生成・編集機能で行い、MCPは実素材の`upload_image`と共有下書きへ接続する。生成機能がない場合やファイルを渡せない場合は未生成・未登録と明示する。参考画像から一枚のUIを作って貼る方式にせず、素材別に生成・出所登録・配置・実UIプレビューを行う。

## 対応言語と商品名

`get_configuration`は現在の`configuration.languages`を`locales`として、収録済みUI言語を`uiLocales`、fallback順を`["en", "ja"]`として返す。新しい専用toolは作らず、`create_draft`→`update_draft`→`validate_draft`→`get_draft_diff`→`request_publication`を共用する。`update_draft`へは他の言語・価格・画像を保持した全configurationを渡す。公開は返された管理画面で人が承認する。

店舗の`languages`に`ja`・`en`を残し、正規のBCP 47コード（例`zh-Hans`・`ko`・`fr-CA`）を追加する。商品`text`には日本語が必須で、各言語の`displayName`と`transliteration`を同時に指定する。片方だけ・空文字・空白だけは422となる。未翻訳の言語は`text`のキー全体を省略できる。`speechName`・`description`・`aliases`は必要に応じて付ける。カテゴリ・選択肢・プラン・ガイド・接客指示・voice・画像altも言語コードのmapを使う。

英語の転写は長音記号付きヘボン式にし、銘柄を残して酒の種別を意味訳する。中国語・韓国語の転写は各言語の文字で記す。商品名の例は`en: { displayName: "Japanese soy sauce fried chicken", transliteration: "Karaage" }`。転写を括弧で意味訳へ埋め込まない。原材料・宗教認証等の安全情報を翻訳で創作しない。追加言語の欠落は英語→日本語へ戻り、選択した接客言語は維持する。
