import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GoogleApiClient } from "../../google/client";
import { googleToolError, jsonToolResult, querySchema, readOnlyAnnotations } from "../shared";

const accountNameSchema = z.string().trim().regex(/^accounts\/[A-Za-z0-9_-]+$/).max(300);
const pathSegmentSchema = z.string().regex(/^[A-Za-z0-9_:-]+$/).max(300);
const dateSchema = z.object({
  year: z.number().int().min(1).max(9_999),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
}).strict().superRefine((date, context) => {
  const daysInMonth = [31, date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][date.month - 1];
  if (daysInMonth !== undefined && date.day > daysInMonth) {
    context.addIssue({ code: "custom", path: ["day"], message: "must be valid for the given year and month" });
  }
});

export const adsenseGenerateReportInputSchema = z.object({
  account: accountNameSchema,
  query: z.object({
    startDate: dateSchema,
    endDate: dateSchema,
    metrics: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    dimensions: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
    filters: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    orderBy: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    limit: z.number().int().min(1).max(10_000).optional(),
    languageCode: z.string().trim().min(2).max(30).optional(),
    currencyCode: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  }).strict(),
}).strict();

export const adsenseReadInputSchema = z.object({
  pathSegments: z.array(pathSegmentSchema).min(1).max(12).refine((segments) => segments[0] === "accounts", "must begin with accounts"),
  query: querySchema,
}).strict();

export function registerAdSenseTools(server: McpServer, client: GoogleApiClient): void {
  server.registerTool("adsense_generate_report", { description: "Generate an AdSense v2 earnings or performance report for an accessible account.", inputSchema: adsenseGenerateReportInputSchema, annotations: readOnlyAnnotations }, async ({ account, query }) => {
    try {
      return jsonToolResult(await client.request({
        host: "https://adsense.googleapis.com",
        path: `/v2/${account}/reports:generate`,
        method: "GET",
        query: encodeAdSenseReportQuery(query),
      }));
    } catch (error) {
      return googleToolError("adsense_generate_report", error);
    }
  });

  server.registerTool("adsense_read", { description: "Read any AdSense Management API v2 resource beneath accounts. Only GET requests to the fixed AdSense API host are allowed.", inputSchema: adsenseReadInputSchema, annotations: readOnlyAnnotations }, async ({ pathSegments, query }) => {
    try {
      return jsonToolResult(await client.request({
        host: "https://adsense.googleapis.com",
        path: `/v2/${pathSegments.join("/")}`,
        method: "GET",
        ...(query === undefined ? {} : { query }),
      }));
    } catch (error) {
      return googleToolError("adsense_read", error);
    }
  });
}

export function encodeAdSenseReportQuery(query: z.infer<typeof adsenseGenerateReportInputSchema>["query"]): Record<string, string | readonly string[]> {
  const output: Record<string, string | readonly string[]> = {
    "startDate.year": String(query.startDate.year),
    "startDate.month": String(query.startDate.month),
    "startDate.day": String(query.startDate.day),
    "endDate.year": String(query.endDate.year),
    "endDate.month": String(query.endDate.month),
    "endDate.day": String(query.endDate.day),
    metrics: query.metrics,
  };
  if (query.dimensions) output.dimensions = query.dimensions;
  if (query.filters) output.filters = query.filters;
  if (query.orderBy) output.orderBy = query.orderBy;
  if (query.limit !== undefined) output.limit = String(query.limit);
  if (query.languageCode) output.languageCode = query.languageCode;
  if (query.currencyCode) output.currencyCode = query.currencyCode;
  return output;
}
