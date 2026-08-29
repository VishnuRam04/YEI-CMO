import { describe, expect, it } from "vitest";
import { evaluateBrandFitForContent } from "../brand-judge";

const memory = {
  kernel: {
    positioning: "Hands-on preschool learning that builds independence",
    category: "Early childhood education",
    differentiators: ["Real daily tasks", "Small classes"],
    proofPoints: ["Children pour their own drinks"],
    competitors: [],
  },
  voice: {
    toneAxes: {},
    do: ["Speak plainly to parents"],
    dont: ["Use jargon"],
    bannedWords: ["revolutionary", "world-class"],
    exemplars: [],
  },
  visualKit: {
    palette: ["#E31837"],
    typography: ["bold playful headings"],
    logoDescription: "Smiling red apple in a graduation cap",
    motifs: ["rainbows", "stars"],
    styleFragment: "bright and cheerful",
    logoSafeArea: "clear space around the mark",
  },
};

/**
 * Poster wording is judged as one block before it is baked into artwork,
 * because text inside an image cannot be corrected after the fact.
 */
function posterText(lines: string[]): string {
  return lines.join("\n");
}

describe("poster wording gate", () => {
  it("judges the poster's lines as a single piece of content", () => {
    const report = evaluateBrandFitForContent(
      memory,
      posterText([
        "Still doing it all for them?",
        "Hands-on learning for ages 3 to 6",
        "Pours their own drink",
        "Book a free trial",
      ]),
      "instagram",
    );
    expect(report.criteria.length).toBeGreaterThan(0);
    expect(typeof report.passed).toBe("boolean");
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it("catches a banned word that would be baked into the artwork", () => {
    const clean = evaluateBrandFitForContent(
      memory, posterText(["Hands-on learning for ages 3 to 6"]), "instagram");
    const banned = evaluateBrandFitForContent(
      memory, posterText(["Our revolutionary world-class preschool"]), "instagram");
    expect(banned.overallScore).toBeLessThan(clean.overallScore);
    const claims = banned.criteria.find((criterion) => criterion.criterion === "voice");
    expect(claims?.passed).toBe(false);
  });
});
