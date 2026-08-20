import { describe, expect, it, vi } from "vitest";

import { getGoogleAccessToken, GoogleAuthorizationError } from "../src/google/auth";

const config = { googleClientId: "client", googleClientSecret: "secret", googleRefreshToken: "refresh" };

describe("Google refresh-token exchange", () => {
  it("uses the OAuth token endpoint and never puts secrets in a URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "access" }), { status: 200 }));
    await expect(getGoogleAccessToken(config, fetcher)).resolves.toBe("access");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("refresh_token=refresh");
  });

  it("retains the complete authorization failure body for Worker logs", async () => {
    await expect(getGoogleAccessToken(config, vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 })))).rejects.toMatchObject({
      constructor: GoogleAuthorizationError,
      status: 400,
      responseBody: "invalid_grant",
    });
  });
});
