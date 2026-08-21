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
    let callCount = 0;
    const fetcher = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      callCount += 1;
      return Promise.resolve(callCount === 1
        ? new Response(JSON.stringify({ access_token: "access" }), { status: 200 })
        : new Response(JSON.stringify({ accounts: [] }), { status: 200 }));
    });
    const client = new GoogleApiClient(config, fetcher);
    await expect(client.request({ host: "https://adsense.googleapis.com", path: "/v2/accounts", method: "GET", query: { pageSize: "10" } })).resolves.toEqual({ accounts: [] });
    const googleCall = fetcher.mock.calls[1];
    expect(googleCall).toBeDefined();
    const [url, init] = googleCall as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://adsense.googleapis.com/v2/accounts?pageSize=10");
    expect(init.headers).toMatchObject({ authorization: "Bearer access" });
  });

  it("repeats array-valued query parameters", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    const client = new GoogleApiClient(config, fetcher);
    await client.request({
      host: "https://adsense.googleapis.com",
      path: "/v2/accounts/pub-123/reports:generate",
      method: "GET",
      query: { metrics: ["ESTIMATED_EARNINGS", "CLICKS"], dimensions: ["DATE", "COUNTRY_NAME"] },
    });
    const [url] = fetcher.mock.calls[1] as unknown as [URL];
    expect(url.searchParams.getAll("metrics")).toEqual(["ESTIMATED_EARNINGS", "CLICKS"]);
    expect(url.searchParams.getAll("dimensions")).toEqual(["DATE", "COUNTRY_NAME"]);
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
