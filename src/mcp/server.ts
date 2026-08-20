import { McpServer } from "@modelcontextprotocol/server";

import type { GoogleApiClient } from "../google/client";
import { registerAdSenseTools } from "./tools/adsense";
import { registerGa4Tools } from "./tools/ga4";

export function createGoogleAnalyticsAdSenseServer(client: GoogleApiClient): McpServer {
  const server = new McpServer({ name: "google-analytics-adsense-remote-mcp", version: "0.1.0" });
  registerGa4Tools(server, client);
  registerAdSenseTools(server, client);
  return server;
}
