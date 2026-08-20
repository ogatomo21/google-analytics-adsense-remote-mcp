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
3. AdSense の要件に従い Installed Application flow で OAuth client と refresh token を発行します。Google API Explorer / OAuth Playground を使う場合も、この read-only 2 scope のみを承認してください。
4. refresh token は再表示できない場合があるため、発行時に安全なパスワードマネージャーへ保管します。リポジトリ、Issue、CI log、`wrangler.jsonc` に置いてはいけません。

Google は access token を短時間で失効させます。Worker は各 MCP ツール実行時に refresh token grant を使って access token を再取得するため、Worker が token を永続保存する必要はありません。

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

## ライセンス

MIT License
