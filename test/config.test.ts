import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/config";
import type { Env } from "../src/types";

const validEnv: Env = {
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "audience",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REFRESH_TOKEN: "refresh-token",
};

describe("parseConfig", () => {
  it("normalizes the Access origin", () => {
    expect(parseConfig(validEnv).accessTeamDomain).toBe("https://team.cloudflareaccess.com");
  });

  it("rejects an Access domain with a path", () => {
    expect(() => parseConfig({ ...validEnv, CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com/unsafe" })).toThrow();
  });

  it("requires every Google secret", () => {
    expect(() => parseConfig({ ...validEnv, GOOGLE_REFRESH_TOKEN: "" })).toThrow();
  });
});
