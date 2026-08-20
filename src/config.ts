import { z } from "zod";

import type { Env } from "./types";

const teamDomainSchema = z.string().trim().url().transform((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || (url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
    context.addIssue({ code: "custom", message: "must be an HTTPS origin without a path" });
    return z.NEVER;
  }
  return url.origin;
});

const configSchema = z.object({
  CF_ACCESS_TEAM_DOMAIN: teamDomainSchema,
  CF_ACCESS_AUD: z.string().trim().min(1).max(500),
  GOOGLE_CLIENT_ID: z.string().trim().min(1).max(500),
  GOOGLE_CLIENT_SECRET: z.string().min(1).max(2_000),
  GOOGLE_REFRESH_TOKEN: z.string().min(1).max(5_000),
});

export interface AppConfig {
  accessTeamDomain: string;
  accessAudience: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
}

export function parseConfig(env: Env): AppConfig {
  const value = configSchema.parse(env);
  return {
    accessTeamDomain: value.CF_ACCESS_TEAM_DOMAIN,
    accessAudience: value.CF_ACCESS_AUD,
    googleClientId: value.GOOGLE_CLIENT_ID,
    googleClientSecret: value.GOOGLE_CLIENT_SECRET,
    googleRefreshToken: value.GOOGLE_REFRESH_TOKEN,
  };
}
