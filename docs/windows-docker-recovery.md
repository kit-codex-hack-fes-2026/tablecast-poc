# WindowsのDocker復旧記録

2026-09-12。動画制作を保留し、Dockerの原因調査を優先している。14時台の比較実験で、DockerをこのCodexのPowerShellから起動すると正常停止後にソケットが残って再起動が失敗し、Windowsスタートメニューから起動すると同じ停止コマンドでもソケットが消えて再起動できる差を確認した。

## 起動元を変えた比較の結果

Docker Desktop 4.90.0.238679、Windows 11 25H2 build 26200.9445、同じユーザー・同じDocker設定・同じ実行ファイルで比較した。停止コマンドは両方とも`docker desktop stop --timeout 45`。アプリのソースやWindows設定は変更していない。

| 起動方法                                  | 起動中の実コンテナ実行 | 正常停止後のソケット | 次の起動                                   |
| ----------------------------------------- | ---------------------- | -------------------- | ------------------------------------------ |
| ユーザーがWindowsスタートメニューから起動 | 成功                   | 0個                  | 手動で再起動成功                           |
| このCodexのPowerShellで`Start-Process`    | 成功                   | 5個残存              | `sailor-ingest.sock`のrename失敗で起動不能 |

比較の時系列（JST）:

1. 14:12、ユーザーが起動。親プロセスはExplorer。`docker run --rm --pull=never --network none`で既存イメージのBunを実行し成功した。
2. ユーザーによる最初の終了・再開ではbackendのPIDが同じだったため、Docker本体の再起動成功とは数えなかった。
3. 14:15、通常のDocker CLI停止が成功し、Dockerプロセス消滅を確認した。14:16にユーザーが再起動し、backendのPIDとソケット生成時刻が更新され、実コンテナ実行が再び成功した。
4. 14:17:40、同じCLI停止を再実行。Dockerプロセス0・内部ソケット0をJSONに保存した。その直後、CodexのPowerShellから同じDocker Desktop.exeを`Start-Process -WindowStyle Hidden`で起動した。
5. 14:17:59、この起動でも実コンテナ実行は成功した。14:18:29に同じCLI停止が正常終了し、Dockerプロセス0に対して内部ソケット5個が残った。
6. 14:19:38、次の起動が残った`sailor-ingest.sock`の`.stale`へのrenameで失敗した。今回の障害を再現できた。
7. 比較を終了し、既知の0 byteソケットだけが入った2フォルダーを退避。ユーザーに手動起動での復旧を依頼した。

**確定したのは、この実行環境ではCodex配下からのDocker起動が、後続の停止・再起動障害を再現させる条件であること。** Docker本体だけの不具合、NTFS破損、Windows更新、特定のJob Objectやハンドル継承機構が根因とまでは断定しない。手動起動したDockerも`IsProcessInJob=true`なので、Job Object内にいる事実だけでは説明できない。

今後この環境ではDocker Desktop本体をユーザーがWindowsから起動し、Codexは稼働済みDockerへの`compose`・`exec`・検査に限定する。Codexからの`Start-Process`、`docker desktop start/restart`を復旧手段として繰り返さない。Dockerのバージョン変更やWindows再インストールより先に、起動元の条件を守って通常停止・再起動と実アプリを確認する。

比較ログ:

- `.local/tablecast-docker-manual-start-context.json`
- `.local/tablecast-docker-manual-second-stop.json`（SocketCount=0）
- `.local/tablecast-docker-codex-start-context.json`
- `.local/tablecast-docker-codex-stop.json`（SocketCount=5）
- `.local/tablecast-docker-codex-restart-failure.log`
- `.local/tablecast-docker-codex-repro-quarantine.json`

## 再調査の結論

**以前は実際に使えていたが、同じDocker起動障害も前セッションから発生していた。今回が初発ではなく、暫定復旧後の再発である。** 2026-09-12の追加調査で、以前のタスク「実装 Issue #1 の動画見本」の操作結果と引き継ぎ書を照合した。

| 時刻（JST）              | 実際に確認できたこと                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 9月11日13:17–13:22       | Docker 4.48.0が`dockerInference`などの残留ソケットを処理できず起動失敗。前タスクに当時のbackendログと退避操作の記録がある。 |
| 9月11日13:25頃以降       | 内部通信フォルダー2つをまとめて退避し、Docker・TableCastが復旧した。                                                        |
| 9月11日18:05             | 音声注文の収録結果に780円の注文IDと`voiceFailures: 0`が保存された。                                                         |
| 9月12日05:00頃           | 引き継ぎ直前の`docker ps`で`tablecast-tablecast-1 Up 16 hours`を確認。                                                      |
| 9月12日12時台–13時台     | 今回の収録準備で音声接続・ホストの公開ポートの応答不良を確認。Docker内部のアプリは応答していた。                            |
| 9月12日13:18:55–13:19:39 | 今回の担当が通信調査のため通常のDocker再起動を実行。その後4.48.0で同じソケット起動失敗が再発。                              |
| 9月12日13:30             | 4.90.0への更新が完了。起動障害はこの更新より前から存在していた。                                                            |
| 9月12日13:44–13:48       | 暫定復旧後、実アプリの音声応答・接続と停止2回・接続中のHTTP正常応答を確認。                                                 |
| 9月12日13:49             | 正常停止とWSL停止後、再びソケットのrename失敗でDocker起動不能。                                                             |

過去の根拠は親ディレクトリの`TABLECAST_VIDEO_WORKFLOW_HANDOFF.md`の第7節、`.local/tablecast-voice-approve-capture.json`、前タスクに残る9月11日の実コマンド出力。引き継ぎ書の「PC再起動後」という表現だけで、その時点のWindows再起動日時まで確定したとは扱わない。

「以前は完全に正常で今回初めて壊れた」「最初から一度も使えなかった」「今回のDocker更新が初発原因」のいずれも、記録とは一致しない。起動できている間のアプリ稼働と、Dockerを停止して再起動できることは別に検証する必要があった。前セッションの暫定復旧を恒久解決として扱うべきではなかった。

現在の直接の停止原因は、Windowsホスト上のDocker Desktopが内部AF_UNIXソケットを再利用できず、backend全体の起動を中断すること。TableCastのComposeやアプリを起動する前に発生する。

2026-09-12 13:49 JSTのbackendログは、Secrets Engineの`engine.sock`を`engine.sock.stale`へrenameする処理が`The file cannot be accessed by the system`で失敗したことを示す。直前にはDocker CLIによる正常停止と`wsl --shutdown`が完了していた。Desktopとbackendの両実行ファイルは4.90.0.238679で、backendのDocker Inc署名はValid。Windowsは11 Home 25H2、build 26200.9445。

Docker 4.89.0と4.90.0のリリースノートには残留ソケットによる起動失敗の修正がある。しかし、同じ4.90.0.238679とWindows 26200.9445で、正常停止後にソケットのrenameが失敗する別環境の報告がある。今回も修正版のrename処理で失敗しているため、「更新済みだから解決」「Windows再起動で解決」とは判定できない。

- [Docker公式リリースノート](https://docs.docker.com/desktop/release-notes/#4900)
- [4.90.0・同じWindowsビルドでの再現報告](https://github.com/docker/desktop-feedback/issues/554#issuecomment-5631203952)
- [正常停止後の再発と再起動でも改善しなかった報告](https://github.com/docker/desktop-feedback/issues/531)

この調査で確定したのは起動の失敗箇所と再現条件までである。WindowsのAF_UNIX実装、Dockerのソケット管理、filesystem/filter driverのどれが低レベルの根因かは未確定。ソケットが0 byteのReparsePointであることや、読み取り専用の`fsutil reparsepoint query`がerror 1920になることだけで、NTFS破損とは断定しない。

## 起動元を分ける追加調査

2026-09-12 14時台に以下を確認した。

- 問題の親フォルダーはいずれも通常のディレクトリで、junction/symlinkではない。実行ユーザーにはFullControlがある。ソケット自身のアクセス失敗は、親フォルダーへの一般的な書き込み権限不足とは区別する。
- CドライブはNTFS、HealthStatusはHealthy、OperationalStatusはOK。これは低レベルの障害を完全に除外する検査ではない。
- Security Centerに登録されたウイルス対策製品はWindows Defender。調査対象期間のDefender検知・Controlled Folder Accessイベント、およびSystemのDisk/Ntfs/Filter関連の警告・エラーは今回の読み取りで得られなかった。`fltmc filters`は管理者権限不足で取得できず、filterの関与を除外したとは扱わない。保護機能の無効化やACL変更は行っていない。
- 調査用PowerShellはMedium integrity、MSIX package identityなし（`GetCurrentPackageFullName`は15700）、Job Object内（`IsProcessInJob`はtrue）。親はCodexの`codex.exe`。これら自体は異常や原因の証明ではない。
- Docker公式`com.docker.diagnose.exe gather`でローカル診断ZIPを保存した。144項目の収集が完了し、一部はDocker停止中のため取得失敗・timeout。アップロードは実施していない。診断ZIPにはホスト情報が含まれるため、公開用の添付には使わない。

別製品の[Claude Codeへの報告](https://github.com/anthropics/claude-code/issues/76383)には、同じPCでも通常のユーザー端末とAIツール配下でAF_UNIXの終了処理が異なるという比較結果がある。これは今回のCodex/Dockerの原因を証明するものではなく、起動元を変えた対照実験の動機である。報告者の「Windowsはclose時に必ずファイルを自動削除する」という主張を一般仕様として採用しない。[Microsoftの説明](https://devblogs.microsoft.com/commandline/af_unix-comes-to-windows/)では同じパスへ再bindする前にDeleteFile等で削除する必要がある。

14:11にDockerプロセスが停止していることと、対象2フォルダー内に既知の0 byte内部ソケットしかないことを確認し、両方を`.tablecast-launch-comparison-20260912-141149`へ退避した。データボリュームには触れていない。退避前の項目は`.local/tablecast-docker-launch-comparison-before.json`へ記録。比較結果は本書冒頭に記載した。

比較では、最初の起動成功だけを結論に使わない。通常の手動終了と再起動まで成功するか、backendの親プロセスとエラーログ、停止後に残るソケットを確認する。

## GitHub最新版との比較

`git fetch origin --no-tags`後、ローカルHEADは`17dc332`、`origin/main`は`d2a30fb`。ローカルに未反映のコミットは59個ある。既存の未コミット変更は保持し、merge・checkoutは実施していない。

最新版では以下が変更されている。

- `38f17fb`でCompose project・volume・公開TCP/UDPをworktree別に分離し、Git共通ディレクトリもmountする。
- `1f57374`で独自の`tablecast-dev.ts`を廃止し、Turboと標準CLIへ移行する。Dev Containerの起動は`bun run dev:container`になる。
- `7d1097d`でルート`compose.yaml`とDev Container用Composeへ整理する。セットアップの正本は`docs/setup.md`。

これらは開発環境の再構築時に合わせる必要があるが、ホストの`engine.sock`再利用失敗を修正する変更ではない。最新版でもLiveKitの`node_ip`は127.0.0.1であり、今回の障害をその値だけの誤りとは判断しない。最新版でのWindows実行検証は未実施。

[調査対象のセットアップ手順](https://github.com/kit-codex-hack-fes-2026/tablecast-poc/blob/d2a30fb/docs/setup.md)

## 確認した問題

- Windows 11 Home、build 26200。Windowsの前回起動は2026-09-10。
- 更新前はDocker Desktop 4.48.0、Engine 28.5.1。
- コンテナ内部のWeb・LiveKit・音声Agentは応答する一方、Windowsから音声接続を始めると公開ポートのHTTPもタイムアウトした。
- コンテナの再作成・Docker Desktop再起動では通信停止が再発した。
- Docker Desktopの起動ログには、`dockerInference`、`engine.sock`などのAF_UNIXソケットを削除・再利用できないエラーもあった。

## 実施した復旧と結果

1. 収録のために作った127.0.0.2の独自TCP転送を停止。通常のCompose設定へ戻した。
2. 起動できない内部通信フォルダーを、Docker停止中に同じ親ディレクトリへ退避した。対象は`%LOCALAPPDATA%\Docker\run`と`%LOCALAPPDATA%\docker-secrets-engine`。後者は`engine.sock`だけであることを確認した。
3. ユーザーがWindowsの管理者確認を承認し、winget経由でDocker Desktop 4.90.0（238679）へ更新した。配布元はDocker公式、インストーラーハッシュの検証は成功。更新後のEngineは29.7.2。
4. 一時コンテナのHTTPサーバーとUDPエコーで確認。UDPの往復と、その直後のHTTP 200が10回連続で成功した。一時コンテナは検証後に削除した。
5. `docker desktop restart --timeout 60`で通常の再起動を検査したところ、`sailor-ingest.sock`の再利用でアクセスエラーとなり起動に失敗した。したがって、更新後の通信改善は確認できたが、Dockerの再起動を含む安定稼働は未確認。
6. その後、通常構成でTableCastを起動。Windows Chromeから実アプリへ接続し、日本語の音声応答を確認した。音声接続中もホストの3000番・8025番は6回連続でHTTP 200だった。
7. 音声の開始・停止を2回検証。UDP 7882でICE connected、受信6311/6089 bytes、停止API 200、UIの再開表示、HTTP 200を両回で確認した。これは既存checkoutとそのローカル修正での結果であり、GitHub最新版の検証ではない。
8. TableCastとDockerを正常停止し、DockerプロセスがなくWSLも停止していることを確認して`wsl --shutdown`を実行した。次のDocker起動は上記のSecrets Engineのrenameで失敗した。現在TableCastは停止中。

Docker Desktop 4.49.0には「転送したUDPポートが停止する不具合」の修正がある。今回の改善と整合するが、ソースコード上の同一原因まで証明したものではない。[公式リリースノート](https://docs.docker.com/desktop/release-notes/#4490)

Windowsで残ったAF_UNIXソケットが再利用できない類似報告もある。[Dockerへの報告](https://github.com/docker/desktop-feedback/issues/460)

## 保全したもの

- TableCastの10個の名前付きボリュームは、更新前後で同じ名前が存在することを確認した。初期化・ボリューム削除は実施していない。更新後のDBで3店舗・36卓・20注文を確認した。
- 元の録画、音声、動画、ソースの既存変更を保持した。
- 内部通信フォルダーの退避先は元の親ディレクトリ内の`*.tablecast-backup-20260912-*`。通常の起動には使わない。
- 検証ログは`.local/tablecast-docker-upgrade.log`、`.local/tablecast-docker-network-after-upgrade.log`。ボリューム一覧は`.local/tablecast-docker-volumes-before-upgrade.txt`。
- 実アプリの証跡は`.local/tablecast-docker-voice-confirmation.log`、`.local/tablecast-docker-host-during-voice.log`、`.local/tablecast-docker-voice-check-before-restart.log`。

## 再開時の確認

Windows再起動は未検証の候補であり、必ず直る手段とは扱わない。内部通信フォルダーの退避は一時的に起動を回復させたが、次の正常停止・起動には耐えなかった。これを恒久修正や自動起動wrapperとして組み込まない。

Dockerの起動を回復させた後、次を順番に確認する。

1. Docker Desktopを開き、`docker desktop status`だけでなく実際のコンテナ実行が成功すること。Resource Saver中のAPIキャッシュ応答だけでEngine稼働とは判定しない。
2. `docker compose -f .devcontainer/compose.yaml up -d`でTableCastを起動すること。
3. コンテナ内で`bun run dev`を起動し、ホストの3000番・8025番が応答すること。
4. UDP通信後もHTTPが応答すること、実アプリの音声接続が成立すること。
5. Dockerの通常再起動後にも同じ検査が通ること。これを確認するまでDockerの復旧完了とは扱わない。

上記2・3は現在の旧checkout向け。最新版へ移行する場合は、既存データと変更を保全したうえでその版の`docs/setup.md`へ合わせる。現時点ではDockerの再起動を含む安定稼働と最新版の環境確認を残している。動画制作は再開しない。
