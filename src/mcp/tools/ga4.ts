import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GoogleApiClient } from "../../google/client";
import { googleToolError, jsonToolResult, querySchema, readOnlyAnnotations } from "../shared";

const propertyIdSchema = z.string().trim().regex(/^\d+$/, "must be a numeric GA4 Property ID").max(30);
const reportLimitSchema = z.union([z.string().regex(/^\d+$/), z.number().int().min(1).max(10_000)]).transform(String).refine((value) => Number(value) >= 1 && Number(value) <= 10_000, "must be between 1 and 10000");
const reportOffsetSchema = z.union([z.string().regex(/^\d+$/), z.number().int().min(0).max(250_000)]).transform(String).refine((value) => Number(value) <= 250_000, "must be between 0 and 250000");
const reportBodySchema = z.object({
  dimensions: z.array(z.object({ name: z.string().trim().min(1).max(100) }).strict()).max(9).optional(),
  metrics: z.array(z.object({ name: z.string().trim().min(1).max(100) }).strict()).min(1).max(10),
  dateRanges: z.array(z.object({ startDate: z.string().trim().min(1).max(30), endDate: z.string().trim().min(1).max(30) }).strict()).max(4).optional(),
  minuteRanges: z.array(z.object({ startMinutesAgo: z.number().int().min(0).max(2_880), endMinutesAgo: z.number().int().min(0).max(2_880) }).strict()).max(2).optional(),
  dimensionFilter: z.record(z.string(), z.unknown()).optional(),
  metricFilter: z.record(z.string(), z.unknown()).optional(),
  orderBys: z.array(z.record(z.string(), z.unknown())).max(9).optional(),
  pivots: z.array(z.record(z.string(), z.unknown())).max(8).optional(),
  metricAggregations: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  currencyCode: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  limit: reportLimitSchema.optional(),
  offset: reportOffsetSchema.optional(),
  keepEmptyRows: z.boolean().optional(),
  returnPropertyQuota: z.boolean().optional(),
}).strict();

export const ga4ReportInputSchema = z.object({ propertyId: propertyIdSchema, request: reportBodySchema }).strict();
export const ga4MetadataInputSchema = z.object({ propertyId: propertyIdSchema }).strict();
export const ga4FunnelInputSchema = z.object({
  propertyId: propertyIdSchema,
  request: z.object({
    funnel: z.record(z.string(), z.unknown()),
    dateRanges: z.array(z.object({ startDate: z.string().trim().min(1).max(30), endDate: z.string().trim().min(1).max(30) }).strict()).max(4).optional(),
    funnelBreakdown: z.record(z.string(), z.unknown()).optional(),
    funnelNextAction: z.record(z.string(), z.unknown()).optional(),
    limit: reportLimitSchema.optional(),
    dimensionFilter: z.record(z.string(), z.unknown()).optional(),
    returnPropertyQuota: z.boolean().optional(),
  }).strict(),
}).strict();
export const ga4AdminReadInputSchema = z.object({
  root: z.enum(["accountSummaries", "accounts", "properties"]),
  pathSegments: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/).max(200)).max(12).default([]),
  query: querySchema,
}).strict();

const reportOperations = [
  ["ga4_run_report", "runReport", "Run a customized GA4 historical report."],
  ["ga4_run_realtime_report", "runRealtimeReport", "Run a GA4 realtime report."],
  ["ga4_run_pivot_report", "runPivotReport", "Run a GA4 pivot report."],
] as const;

export function registerGa4Tools(server: McpServer, client: GoogleApiClient): void {
  for (const [name, operation, description] of reportOperations) {
    server.registerTool(name, { description, inputSchema: ga4ReportInputSchema, annotations: readOnlyAnnotations }, async ({ propertyId, request }) => {
      try {
        return jsonToolResult(await client.request({
          host: "https://analyticsdata.googleapis.com",
          path: `/v1beta/properties/${propertyId}:${operation}`,
          method: "POST",
          body: request,
        }));
      } catch (error) {
        return googleToolError(name, error);
      }
    });
  }

  server.registerTool("ga4_run_funnel_report", { description: "Run a GA4 funnel report.", inputSchema: ga4FunnelInputSchema, annotations: readOnlyAnnotations }, async ({ propertyId, request }) => {
    try {
      return jsonToolResult(await client.request({
        host: "https://analyticsdata.googleapis.com",
        path: `/v1beta/properties/${propertyId}:runFunnelReport`,
        method: "POST",
        body: request,
      }));
    } catch (error) {
      return googleToolError("ga4_run_funnel_report", error);
    }
  });

  server.registerTool("ga4_get_metadata", { description: "Get dimensions and metrics available for a GA4 property.", inputSchema: ga4MetadataInputSchema, annotations: readOnlyAnnotations }, async ({ propertyId }) => {
    try {
      return jsonToolResult(await client.request({ host: "https://analyticsdata.googleapis.com", path: `/v1beta/properties/${propertyId}/metadata`, method: "GET" }));
    } catch (error) {
      return googleToolError("ga4_get_metadata", error);
    }
  });

  server.registerTool("ga4_check_compatibility", { description: "Check whether requested GA4 dimensions and metrics are compatible.", inputSchema: ga4ReportInputSchema, annotations: readOnlyAnnotations }, async ({ propertyId, request }) => {
    try {
      return jsonToolResult(await client.request({ host: "https://analyticsdata.googleapis.com", path: `/v1beta/properties/${propertyId}:checkCompatibility`, method: "POST", body: request }));
    } catch (error) {
      return googleToolError("ga4_check_compatibility", error);
    }
  });

  server.registerTool("ga4_admin_read", { description: "Read any GA4 Admin API v1alpha resource under accountSummaries, accounts, or properties. Only GET requests to the fixed Google Admin API host are allowed.", inputSchema: ga4AdminReadInputSchema, annotations: readOnlyAnnotations }, async ({ root, pathSegments, query }) => {
    try {
      return jsonToolResult(await client.request({
        host: "https://analyticsadmin.googleapis.com",
        path: `/v1alpha/${[root, ...pathSegments].join("/")}`,
        method: "GET",
        ...(query === undefined ? {} : { query }),
      }));
    } catch (error) {
      return googleToolError("ga4_admin_read", error);
    }
  });
}
