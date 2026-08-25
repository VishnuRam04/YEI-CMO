import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";

describe("Analyst prompts", () => {
  it("requires hedging and delimits aggregate data", () => {
    expect(buildSystemPrompt("Northwind")).toContain("n=10");
    expect(
      buildUserPrompt([{ label: "CTR", value: 3.2, sampleSize: 8 }]),
    ).toContain("<metrics>");
    expect(buildUserPrompt([{ label: "CTR", value: 3.2, sampleSize: 8 }])).toContain("hedge");
  });
});
