import { describe, expect, it } from "vitest";

import { adsenseGenerateReportInputSchema, adsenseReadInputSchema } from "../src/mcp/tools/adsense";
import { ga4AdminReadInputSchema, ga4FunnelInputSchema, ga4ReportInputSchema } from "../src/mcp/tools/ga4";

describe("tool schemas", () => {
  it("accepts a bounded GA4 report", () => {
    const result = ga4ReportInputSchema.safeParse({ propertyId: "123", request: { metrics: [{ name: "activeUsers" }], limit: 100 } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.request.limit).toBe("100");
  });

  it("rejects an unknown GA4 report field and nonnumeric property", () => {
    expect(ga4ReportInputSchema.safeParse({ propertyId: "properties/123", request: { metrics: [{ name: "activeUsers" }], url: "https://example.com" } }).success).toBe(false);
  });

  it("accepts a dedicated funnel request", () => {
    expect(ga4FunnelInputSchema.safeParse({ propertyId: "123", request: { funnel: { steps: [] } } }).success).toBe(true);
  });

  it("blocks unsafe administrative and AdSense routes", () => {
    expect(ga4AdminReadInputSchema.safeParse({ root: "https:", pathSegments: ["evil"] }).success).toBe(false);
    expect(adsenseReadInputSchema.safeParse({ pathSegments: ["https:", "evil"] }).success).toBe(false);
  });

  it("bounds generic API pagination", () => {
    expect(ga4AdminReadInputSchema.safeParse({ root: "properties", query: { pageSize: "10001" } }).success).toBe(false);
  });

  it("accepts a bounded AdSense report", () => {
    expect(adsenseGenerateReportInputSchema.safeParse({ account: "accounts/pub-123", query: { startDate: "2026-01-01", endDate: "2026-01-31", metrics: ["ESTIMATED_EARNINGS"] } }).success).toBe(true);
  });
});
