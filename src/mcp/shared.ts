import { z } from "zod";

import { logGoogleFailure, safeErrorMessage } from "../google/client";

export const MAX_RESULT_CHARACTERS = 100_000;
export const querySchema = z.record(z.string().trim().min(1).max(100), z.string().trim().max(2_000)).superRefine((query, context) => {
  for (const [key, value] of Object.entries(query)) {
    if (key === "pageSize" || key === "page_size" || key === "limit") {
      const amount = Number(value);
      if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) {
        context.addIssue({ code: "custom", path: [key], message: "must be an integer between 1 and 10000" });
      }
    }
    if (key === "startIndex" || key === "start_index") {
      const offset = Number(value);
      if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
        context.addIssue({ code: "custom", path: [key], message: "must be an integer between 0 and 1000000" });
      }
    }
  }
}).optional();

export function jsonToolResult(value: unknown) {
  const json = JSON.stringify(value, null, 2);
  const text = json.length <= MAX_RESULT_CHARACTERS ? json : `${json.slice(0, MAX_RESULT_CHARACTERS)}\n\n[Output truncated at ${MAX_RESULT_CHARACTERS} characters.]`;
  return { content: [{ type: "text" as const, text }] };
}

export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function googleToolError(tool: string, error: unknown) {
  logGoogleFailure(tool, error);
  return toolError(safeErrorMessage(error));
}

export const readOnlyAnnotations = { readOnlyHint: true } as const;
