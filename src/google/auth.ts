import type { AppConfig } from "../config";

export type Fetcher = typeof fetch;

export class GoogleAuthorizationError extends Error {
  constructor(
    public readonly status?: number,
    public readonly responseBody?: string,
  ) {
    super("Google authorization failed.");
    this.name = "GoogleAuthorizationError";
  }
}

export async function getGoogleAccessToken(config: Pick<AppConfig, "googleClientId" | "googleClientSecret" | "googleRefreshToken">, fetcher: Fetcher = fetch): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    refresh_token: config.googleRefreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetcher.call(globalThis, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new GoogleAuthorizationError(response.status, await response.text());
  const payload: unknown = await response.json();
  if (!isAccessTokenPayload(payload)) throw new GoogleAuthorizationError();
  return payload.access_token;
}

function isAccessTokenPayload(value: unknown): value is { access_token: string } {
  return typeof value === "object" && value !== null && "access_token" in value && typeof value.access_token === "string" && value.access_token.length > 0;
}
