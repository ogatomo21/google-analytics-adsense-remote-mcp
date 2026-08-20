import { GoogleAuthorizationError, getGoogleAccessToken } from "./auth";
import type { Fetcher } from "./auth";
import type { AppConfig } from "../config";

export interface GoogleRequest {
  host: "https://analyticsadmin.googleapis.com" | "https://analyticsdata.googleapis.com" | "https://adsense.googleapis.com";
  path: string;
  method: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
}

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly request: { method: GoogleRequest["method"]; url: string; body?: unknown },
    public readonly responseBody: string,
  ) {
    super("Google API request failed.");
    this.name = "GoogleApiError";
  }
}

export class GoogleApiClient {
  constructor(private readonly config: AppConfig, private readonly fetcher: Fetcher = fetch) {}

  async request(request: GoogleRequest): Promise<unknown> {
    const accessToken = await getGoogleAccessToken(this.config, this.fetcher);
    const url = new URL(request.path, request.host);
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
    const response = await this.fetcher.call(globalThis, url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    if (!response.ok) {
      throw new GoogleApiError(response.status, {
        method: request.method,
        url: url.toString(),
        ...(request.body === undefined ? {} : { body: request.body }),
      }, await response.text());
    }
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

/** Emit complete Google failure details to the deploying account's Worker logs. */
export function logGoogleFailure(tool: string, error: unknown): void {
  const diagnostic: Record<string, unknown> = {
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
  }
  diagnostic.error = errorDetails(error);
  console.error(JSON.stringify(diagnostic));
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      ...Object.fromEntries(Object.getOwnPropertyNames(error)
        .filter((property) => property !== "name" && property !== "message" && property !== "stack")
        .map((property) => [property, serializeErrorProperty(Reflect.get(error, property))])),
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return { thrown: error };
}

function serializeErrorProperty(value: unknown): unknown {
  return value instanceof Error ? errorDetails(value) : value;
}
