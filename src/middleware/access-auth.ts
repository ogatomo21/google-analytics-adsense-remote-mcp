import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";

import { parseConfig } from "../config";
import type { AppConfig } from "../config";
import type { Env } from "../types";

export type AccessJwtVerifier = (token: string, config: Pick<AppConfig, "accessTeamDomain" | "accessAudience">) => Promise<void>;

const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const verifyAccessJwt: AccessJwtVerifier = async (token, config) => {
  let jwks = jwksByTeamDomain.get(config.accessTeamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${config.accessTeamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(config.accessTeamDomain, jwks);
  }
  await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
    audience: config.accessAudience,
    issuer: config.accessTeamDomain,
  });
};

export function createAccessAuth(verifier: AccessJwtVerifier = verifyAccessJwt): MiddlewareHandler<{ Bindings: Env }> {
  return async (context, next) => {
    const token = context.req.header("cf-access-jwt-assertion");
    if (!token) return context.json({ error: "Cloudflare Access authentication is required." }, 401);
    try {
      const config = parseConfig(context.env);
      await verifier(token, config);
    } catch {
      return context.json({ error: "Cloudflare Access authentication failed." }, 401);
    }
    await next();
  };
}
