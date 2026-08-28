import { describe, expect, it } from "vitest";
import { PosterCopySchema } from "../schema";
import { buildPosterCopyPrompt } from "../prompt";

const valid = {
  headline: "Still doing it all for them?",
  subheadline: "Hands-on learning for ages 3 to 6",
  highlights: ["Pours their own drink", "Packs their own bag"],
  callToAction: "Book a free trial",
};

describe("poster copy contract", () => {
  it("accepts short, punchy wording", () => {
    expect(PosterCopySchema.parse(valid).headline).toBe("Still doing it all for them?");
  });

  it("rejects a caption sentence used as a headline", () => {
    // This is the shape that produced an ellipsis in the artwork.
    const result = PosterCopySchema.safeParse({
      ...valid,
      headline: "Worried your child is relying on you for every little daily task?",
    });
    expect(result.success).toBe(false);
  });

  it("rejects wordy highlights and calls to action", () => {
    expect(PosterCopySchema.safeParse({
      ...valid,
      highlights: ["They learn to pour their own drink at snack time"],
    }).success).toBe(false);
    expect(PosterCopySchema.safeParse({
      ...valid,
      callToAction: "Tap the link in our bio to chat with us on WhatsApp",
    }).success).toBe(false);
  });

  it("requires at least two highlights so the icon set reads as a set", () => {
    expect(PosterCopySchema.safeParse({ ...valid, highlights: ["Only one"] }).success).toBe(false);
  });

  it("asks for compression without inventing claims", () => {
    const prompt = buildPosterCopyPrompt("Tadika Tunas Intelek", "A long approved caption.");
    expect(prompt).toContain("at most 6 words");
    expect(prompt).toContain("Do not add a claim, price, date");
    expect(prompt).toContain("Never end a line with an ellipsis");
    expect(prompt).toContain("A long approved caption.");
  });
});
