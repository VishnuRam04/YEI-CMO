import { describe, expect, it } from "vitest";
import { buildResearchPrompt, buildSystemPrompt, buildUserPrompt } from "../prompt";
import { AnalystPayloadSchema } from "../schema";

describe("Analyst prompts", () => {
  it("requires hedging and delimits aggregate data", () => {
    expect(buildSystemPrompt("Northwind")).toContain("below n=10");
    expect(
      buildUserPrompt([{ label: "CTR", value: 3.2, sampleSize: 8 }]),
    ).toContain("<metrics>");
  });

  it("directs grounded research to official source lanes without overstating ad results", () => {
    const prompt = buildResearchPrompt({
      payload: AnalystPayloadSchema.parse({
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-26T00:00:00.000Z",
        mode: "market-research",
        objective: "Find eyewear trends",
      }),
      brandName: "Northwind",
      category: "Eyewear",
      positioning: "Accessible premium",
      performanceSignals: [],
      sourceTargets: ["TikTok Creative Center"],
      now: "2026-08-26T12:00:00.000Z",
    });

    expect(prompt).toContain("<source_targets>");
    expect(prompt).toContain("TikTok Creative Center");
    expect(prompt).toContain("active ad performed well");
    expect(prompt).toContain("Where category messaging, proof, offers or channel execution leave an exploitable gap");
    expect(prompt).toContain("Three evidence-backed ways this brand could stand out");
  });
});
