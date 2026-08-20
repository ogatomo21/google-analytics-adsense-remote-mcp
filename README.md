# Google Analytics + AdSense Remote MCP

Cloudflare Workers 上で動く、GA4 と AdSense Management API v2 の**読み取り専用** Remote MCP サーバーです。HTTP ルーティングは Hono、MCP transport は `createMcpHandler()`、クライアントの OAuth 認可は Cloudflare Access Managed OAuth を利用します。

1 つの Worker は 1 組の Google OAuth refresh token に固定され、その Google アカウントが読み取れるすべての GA4 プロパティと AdSense アカウントを扱います。ツール呼び出しから OAuth 資格情報・Google API ホスト・書込み操作を差し替えることはできません。

## Cloudflare へワンクリックデプロイ

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ogatomo21/google-analytics-adsense-remote-mcp)

ボタンはこの公開 GitHub リポジトリを利用者自身のアカウントへ複製し、Worker 名と次の設定を入力してビルド・デプロイします。

- 非秘密設定: `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`
- Secret: `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REFRESH_TOKEN`

`GOOGLE_REFRESH_TOKEN` はボタンを押す前に、後述の手順で read-only scope だけを承認して発行してください。Cloudflare Access Application と Managed OAuth の有効化はデプロイ後に利用者自身で行います。

## エンドポイント

| Endpoint | 認証 | 内容 |
| --- | --- | --- |
| `GET /` | 不要 | サービス概要。資格情報は返しません。 |
| `GET /health` | 不要 | ヘルスチェック。 |
| `ALL /mcp` | Cloudflare Access | Streamable HTTP MCP endpoint。 |

## MCP ツール

- `ga4_run_report`、`ga4_run_realtime_report`、`ga4_run_pivot_report`、`ga4_run_funnel_report`
- `ga4_get_metadata`、`ga4_check_compatibility`
- `ga4_admin_read`: GA4 Admin API v1alpha の `accountSummaries`、`accounts`、`properties` 配下の GET/list 操作。
- `adsense_generate_report`
- `adsense_read`: AdSense Management API v2 の `accounts` 配下の GET/list 操作。

すべてのツールは read-only として MCP に注釈付けされ、入力は Zod で検証されます。外部 URL、任意 HTTP ヘッダー、POST/PUT/PATCH/DELETE の任意実行は受け付けません。Google の生エラー・access token・refresh token・client secret は応答にもログにも含めません。

## Google OAuth の準備

1. Google Cloud Project で **Google Analytics Data API**、**Google Analytics Admin API**、**AdSense Management API** を有効にします。
2. OAuth consent screen を設定し、GA4 の `https://www.googleapis.com/auth/analytics.readonly` と AdSense の `https://www.googleapis.com/auth/adsense.readonly` だけを要求します。
3. Credentials で OAuth Client ID を作成し、Application type は **Desktop app** を選択します。AdSense は service account 非対応で、Installed Application flow が必要です。
4. refresh token は再表示できない場合があるため、発行時に安全なパスワードマネージャーへ保管します。リポジトリ、Issue、CI log、`wrangler.jsonc` に置いてはいけません。

Google は access token を短時間で失効させます。Worker は各 MCP ツール実行時に refresh token grant を使って access token を再取得するため、Worker が token を永続保存する必要はありません。

### Python で refresh token を発行する

Python 3.10 以降だけで動作し、追加パッケージは不要です。`scripts/get_google_refresh_token.py` は PKCE を使ってローカル callback を待ち受け、資格情報・access token・refresh token をファイルへ保存しません。

#### Google Cloud Console の redirect URI 設定

この Worker は Google から直接 callback を受けません。Credentials で作成する OAuth client は必ず **Desktop app** にしてください。Desktop app では Cloud Console の **Authorized redirect URIs** や **Authorized JavaScript origins** を設定する必要はありません。

Python スクリプトは実行時に空いているローカル port を選び、例えば次のような loopback redirect URI を Google へ送ります。

```text
http://127.0.0.1:54321/callback/
```

これは Google が Desktop app 用に許可する loopback callback です。`https://<worker-host>/callback`、`https://<worker-host>/mcp`、Cloudflare Access の URL を Google OAuth client の redirect URI として登録してはいけません。また、Web application 型の OAuth client でこのスクリプトを使うことも避けてください。

```powershell
python scripts/get_google_refresh_token.py
```

`GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` の入力を求められます。ブラウザで、Worker が使う Google アカウントにログインし、次の **read-only** scope だけを承認してください。

ブラウザ承認を取り消したい場合は、待受中のターミナルで `Ctrl+C` を押してください。ローカル callback listener を閉じ、token を保存せず終了します。

- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/adsense.readonly`

成功時に表示される1行だけをコピーし、Deploy Button の `GOOGLE_REFRESH_TOKEN` Secret 欄、または次の対話コマンドへ入力します。

```powershell
pnpm wrangler secret put GOOGLE_REFRESH_TOKEN
```

Client ID / secret も未設定なら同様に設定します。

```powershell
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
```

Google OAuth consent screen が External + Testing のままだと refresh token は通常7日で失効します。継続利用する前に Production へ移行し、Google が求める verification を完了してください。`invalid_grant` が発生した場合は、Google アカウントで本アプリのアクセスを取り消してからこのスクリプトを再実行し、Worker Secret を更新します。

## ローカル開発

必要: Node.js 20 以上、Corepack、Cloudflare Zero Trust を使える Cloudflare アカウント。

```bash
corepack enable
pnpm install
Copy-Item .dev.vars.example .dev.vars
pnpm check
pnpm dev --local
```

`.dev.vars` に実際の Google credentials を設定します。このファイルは Git に追加しません。

## Cloudflare へのデプロイ

1. `wrangler.jsonc` の `name`、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD` を自分の Cloudflare Access 設定値に変更します。
2. Secret を個別に設定します。

```bash
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put GOOGLE_REFRESH_TOKEN
pnpm run deploy
```

3. Cloudflare Zero Trust Dashboard で Worker の `https://<worker-host>/mcp` を対象に **MCP server application** を作成します。
4. 許可するメールアドレスまたは ID group の Access Policy を作成し、対象外のユーザーを拒否します。
5. Advanced settings で **Managed OAuth** を有効にします。Application Audience tag と Team Domain が Worker 設定値と一致していることを確認します。

Cloudflare Access が OAuth discovery、Dynamic Client Registration、Authorization Code Flow、PKCE、Access token の更新を担います。Worker 内に独自の `/authorize`、`/token`、`/register` を追加しないでください。

## MCP クライアント接続

MCP endpoint は `https://<worker-host>/mcp` です。最初の接続時に Cloudflare Access のログイン・認可が開きます。

- Inspector: `npx @modelcontextprotocol/inspector@latest` を起動して endpoint を接続し、全ツールを Scan / List Tools します。
- Codex 等: OAuth 対応の Remote MCP 設定へ endpoint を登録します。
- ChatGPT: Developer mode の Custom MCP app / connector に endpoint を登録し、OAuth 認可を完了してから Tool Scan を実行します。ChatGPT の利用可否は契約プラン・Workspace 設定・地域に依存します。

## 検証

```bash
pnpm check
```

`check` は ESLint、TypeScript、Vitest、Worker binding 型同期、`wrangler deploy --dry-run` を順に実行します。実 Google アカウントへの問い合わせは自動テストしません。デプロイ後に Access を通して Inspector と利用する MCP クライアントで、GA4 report と AdSense report を 1 件ずつ実行してください。

### Google API の障害調査

Google API の失敗時には、Worker が Cloudflare Workers Logs へ JSON の診断イベントを出力します。request path・クエリ・Google の生エラー・client secret・access token・refresh token は出力しません。

```powershell
pnpm wrangler tail --format json
```

例: `{"event":"google_request_failed","tool":"ga4_run_report","category":"google_api","upstreamStatus":403}`。`oauth_refresh` は refresh token の更新失敗、`google_api` は GA4 / AdSense API の拒否、`unexpected` はネットワーク等の予期しない失敗です。

## ライセンス

MIT License
