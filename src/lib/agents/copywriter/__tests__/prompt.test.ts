import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";

describe("Copywriter prompts", () => {
  it("includes brand fields and banned words", () => {
    const prompt = buildSystemPrompt({
      name: "Northwind",
      positioning: "One shared memory",
      toneAxes: { direct: 5 },
      do: ["Be specific"],
      dont: ["Overclaim"],
      bannedWords: ["revolutionary"],
      exemplars: ["A real example"],
    });
    expect(prompt).toContain("One shared memory");
    expect(prompt).toContain("revolutionary");
    expect(buildUserPrompt("Launch", "linkedin")).toContain(
      "<brief>Launch</brief>",
    );
  });
});
