import { describe, expect, it } from "vitest";
import {
  buildSynthesisPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  conversationalResponse,
  formatCmoResponse,
} from "../prompt";
import { CmoResponseSchema } from "../schema";

const response = {
  title: "Promising — refine the execution",
  executiveSummary: "The idea is sound, but the offer needs a sharper conversion path.",
  verdict: "promising" as const,
  keyPoints: [],
  options: [
    { id: "lean", title: "Lean test", summary: "Test one proof-led post.", cost: "low" as const, risk: "low" as const },
    { id: "balanced", title: "Focused campaign", summary: "Run a two-week campaign.", cost: "medium" as const, risk: "low" as const },
    { id: "reach", title: "Reach push", summary: "Add paid distribution.", cost: "high" as const, risk: "medium" as const },
  ],
  recommendedOptionId: "balanced",
  recommendation: "",
  nextStep: "Choose one option.",
};

describe("CMO prompts", () => {
  it("includes brand context and delimits user input", () => {
    const systemPrompt = buildSystemPrompt({
        name: "Northwind",
        url: "https://example.com",
        kernel: { positioning: "Shared memory" },
        voice: { bannedWords: ["revolutionary"] },
      });
    expect(systemPrompt).toContain("Shared memory");
    expect(systemPrompt).toContain("decisive commercial leader");
    expect(systemPrompt).toContain("provide exactly three materially different options");
    expect(buildUserPrompt("Write a launch post", [])).toContain(
      "<user_request>Write a launch post</user_request>",
    );
  });

  it("synthesises only bounded worker summaries", () => {
    const prompt = buildSynthesisPrompt("Write a post", response, [
      "copywriter: 3 variants",
    ]);
    expect(prompt).toContain("copywriter: 3 variants");
    expect(prompt).toContain("do not invent specialist findings");
  });

  it("retains a clean text fallback for API consumers", () => {
    const formatted = formatCmoResponse(response);
    expect(formatted).not.toContain("Recommendation:");
    expect(formatted).toContain("Focused campaign (best fit)");
    expect(formatted).toContain("[medium cost, low risk]");
    expect(formatted).toContain("Next step:");
  });

  it("uses a lightweight response for greetings only", () => {
    expect(conversationalResponse("Hi", "Northwind")?.executiveSummary)
      .toContain("your CMO for Northwind");
    expect(conversationalResponse("Hi, explain our positioning", "Northwind"))
      .toBeNull();
  });

  it("allows either no choices or exactly three choices", () => {
    expect(CmoResponseSchema.safeParse(response).success).toBe(true);
    expect(CmoResponseSchema.safeParse({
      ...response,
      options: response.options.slice(0, 1),
    }).success).toBe(false);
  });
});
