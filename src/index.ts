import { createMcpHandler } from "agents/mcp/server";
import { Hono } from "hono";

import { parseConfig } from "./config";
import { GoogleApiClient } from "./google/client";
import { createAccessAuth } from "./middleware/access-auth";
import { createGoogleAnalyticsAdSenseServer } from "./mcp/server";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (context) => context.json({
  name: "google-analytics-adsense-remote-mcp",
  mcpEndpoint: "/mcp",
  authentication: "Cloudflare Access Managed OAuth",
  capabilities: ["GA4 read-only", "AdSense read-only"],
}));

app.get("/health", (context) => context.json({ ok: true }));

app.use("/mcp", createAccessAuth());
app.all("/mcp", (context) => {
  const client = new GoogleApiClient(parseConfig(context.env));
  const handler = createMcpHandler(() => createGoogleAnalyticsAdSenseServer(client), {
    allowedOriginHostnames: "*",
  });
  return handler(context.req.raw, context.env, context.executionCtx as Parameters<typeof handler>[2]);
});

app.notFound((context) => context.json({ error: "Not found." }, 404));
app.onError((_error, context) => context.json({ error: "Internal server error." }, 500));

export default app;
