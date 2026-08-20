import { describe, expect, it, vi } from "vitest";

import { GoogleApiClient, GoogleApiError, logGoogleFailure, safeErrorMessage } from "../src/google/client";

const config = {
  accessTeamDomain: "https://team.cloudflareaccess.com",
  accessAudience: "audience",
  googleClientId: "client",
  googleClientSecret: "secret",
  googleRefreshToken: "refresh",
};

describe("Google API client", () => {
  it("uses the fixed API host and bearer header", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [] }), { status: 200 }));
    const client = new GoogleApiClient(config, fetcher);
    await expect(client.request({ host: "https://adsense.googleapis.com", path: "/v2/accounts", method: "GET", query: { pageSize: "10" } })).resolves.toEqual({ accounts: [] });
    const [url, init] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(url.toString()).toBe("https://adsense.googleapis.com/v2/accounts?pageSize=10");
    expect(init.headers).toMatchObject({ authorization: "Bearer access" });
  });

  it("does not expose raw upstream messages", () => {
    expect(safeErrorMessage(new Error("refresh=secret"))).not.toContain("secret");
  });

  it("logs complete diagnostics", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logGoogleFailure("adsense_read", new GoogleApiError(403, {
      method: "GET",
      url: "https://adsense.googleapis.com/v2/accounts?pageSize=10",
    }, "permission denied"));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("\"responseBody\":\"permission denied\""));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("\"url\":\"https://adsense.googleapis.com/v2/accounts?pageSize=10\""));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("\"name\":\"GoogleApiError\""));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("\"stack\":"));
    logger.mockRestore();
  });
});
