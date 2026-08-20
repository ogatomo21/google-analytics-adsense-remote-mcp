import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createAccessAuth } from "../src/middleware/access-auth";
import type { Env } from "../src/types";

const env: Env = {
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "audience",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REFRESH_TOKEN: "refresh-token",
};

function appWith(verifier: Parameters<typeof createAccessAuth>[0]) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/mcp", createAccessAuth(verifier));
  app.get("/mcp", (context) => context.text("ok"));
  return app;
}

describe("Cloudflare Access middleware", () => {
  it("returns 401 without an assertion", async () => {
    const verifier = vi.fn();
    const response = await appWith(verifier).request("https://worker.example/mcp", undefined, env);
    expect(response.status).toBe(401);
    expect(verifier).not.toHaveBeenCalled();
  });

  it("accepts a verified assertion", async () => {
    const verifier = vi.fn().mockResolvedValue(undefined);
    const response = await appWith(verifier).request("https://worker.example/mcp", { headers: { "cf-access-jwt-assertion": "safe-token" } }, env);
    expect(response.status).toBe(200);
    expect(verifier).toHaveBeenCalledOnce();
  });

  it("does not reveal verifier failures", async () => {
    const response = await appWith(async () => { throw new Error("sensitive detail"); }).request("https://worker.example/mcp", { headers: { "cf-access-jwt-assertion": "token" } }, env);
    expect(await response.json()).toEqual({ error: "Cloudflare Access authentication failed." });
  });
});
