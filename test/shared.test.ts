import { describe, expect, it } from "vitest";

import { jsonToolResult, MAX_RESULT_CHARACTERS } from "../src/mcp/shared";

describe("MCP response formatting", () => {
  it("truncates oversized Google responses", () => {
    const result = jsonToolResult({ data: "x".repeat(MAX_RESULT_CHARACTERS + 1_000) });
    const [content] = result.content;
    expect(content).toBeDefined();
    if (!content) throw new Error("Expected a text result.");
    expect(content.text).toContain("[Output truncated");
    expect(content.text.length).toBeLessThanOrEqual(MAX_RESULT_CHARACTERS + 100);
  });
});
