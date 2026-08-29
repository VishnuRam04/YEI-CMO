import { describe, expect, it } from "vitest";
import { evaluateBrandFitForContent } from "../brand-judge";

describe("brand judge", () => {
  const brandMemory = {
    kernel: {
      positioning: "We help lean marketing teams ship consistent, evidence-led campaigns without brand drift.",
      category: "B2B marketing automation",
      icps: [{ name: "lean marketing teams", needs: ["fewer people", "more output"] }],
    },
    voice: {
      toneAxes: { formal: 2, technical: 2, bold: 3, warm: 3, concise: 4, playful: 1 },
      do: ["clear", "measured", "useful"],
      dont: ["salesy", "performative"],
      bannedWords: ["guaranteed", "best in class", "#1"],
      exemplars: ["Your brand should be consistent, not generic."],
    },
    visualKit: {
      palette: ["#123456", "#F5F0E8", "#A3C9A8"],
      paletteRoles: [{ hex: "#123456", role: "primary" }],
      motifs: ["clean systems", "structured clarity"],
      typography: ["clear sans", "humanistic sans"],
      logoDescription: "Wordmark with a structured geometric symbol",
      styleFragment: "clean, structured, practical",
      logoSafeArea: "Leave breathing room around the wordmark",
    },
  };

  it("passes brand-aligned copy", () => {
    const report = evaluateBrandFitForContent(
      brandMemory,
      "Lean marketing teams need clearer systems, not more noise. We help teams ship brand-consistent campaigns with less churn.",
      "linkedin",
    );

    expect(report.passed).toBe(true);
    expect(report.overallScore).toBeGreaterThanOrEqual(75);
    expect(report.criteria.every((criterion) => criterion.score >= 75)).toBe(true);
  });

  it("rejects banned language and risky claims", () => {
    const report = evaluateBrandFitForContent(
      brandMemory,
      "We are the #1 guaranteed platform for the best-in-class marketing system.",
      "linkedin",
    );

    expect(report.passed).toBe(false);
    expect(report.overallScore).toBeLessThan(75);
    expect(report.criteria.some((criterion) => criterion.criterion === "voice")).toBe(true);
  });
});
