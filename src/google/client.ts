import { GoogleAuthorizationError, getGoogleAccessToken } from "./auth";
import type { Fetcher } from "./auth";
import type { AppConfig } from "../config";

export class GoogleApiError extends Error {
  constructor(public readonly status: number) {
    super("Google API request failed.");
  }
}

export interface GoogleRequest {
  host: "https://analyticsadmin.googleapis.com" | "https://analyticsdata.googleapis.com" | "https://adsense.googleapis.com";
  path: string;
  method: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
}

export class GoogleApiClient {
  constructor(private readonly config: AppConfig, private readonly fetcher: Fetcher = fetch) {}

  async request(request: GoogleRequest): Promise<unknown> {
    const accessToken = await getGoogleAccessToken(this.config, this.fetcher);
    const url = new URL(request.path, request.host);
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
    const response = await this.fetcher(url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    if (!response.ok) throw new GoogleApiError(response.status);
    return response.json();
  }
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof GoogleAuthorizationError) return "Google authorization failed. Check the Worker secrets and renew the refresh token if necessary.";
  if (error instanceof GoogleApiError) {
    if (error.status === 401 || error.status === 403) return "Google denied this read request. Check the Google account permissions and enabled read-only scopes.";
    if (error.status === 429) return "Google rate-limited this request. Try again later.";
    if (error.status >= 400 && error.status < 500) return "Google rejected the read request. Check the resource identifier and query parameters.";
  }
  return "The Google API request could not be completed.";
}

/**
 * Emit only diagnostics that are safe for Cloudflare Workers Logs. In
 * particular, do not log request paths, query values, error messages, or any
 * credential/token because those can contain private analytics data.
 */
export function logGoogleFailure(tool: string, error: unknown): void {
  const diagnostic: Record<string, string | number> = {
    event: "google_request_failed",
    tool,
  };
  if (error instanceof GoogleAuthorizationError) {
    diagnostic.category = "oauth_refresh";
    if (error.status !== undefined) diagnostic.upstreamStatus = error.status;
  } else if (error instanceof GoogleApiError) {
    diagnostic.category = "google_api";
    diagnostic.upstreamStatus = error.status;
  } else {
    diagnostic.category = "unexpected";
    if (error instanceof Error) diagnostic.errorName = error.name;
  }
  console.error(JSON.stringify(diagnostic));
}
