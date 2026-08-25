import { describe, expect, it } from "vitest";
import {
  CopywriterPayloadSchema,
  VariantsSchema,
  isTextPayload,
  refinementFor,
} from "../schema";

describe("Copywriter schemas", () => {
  it("keeps the existing mode-less CMO text payload compatible", () => {
    const parsed = CopywriterPayloadSchema.parse({
      channel: "linkedin",
      brief: "Announce the launch.",
      refinement: "Make it shorter.",
      priorText: "The original post.",
    });

    expect(isTextPayload(parsed)).toBe(true);
    if (!isTextPayload(parsed)) throw new Error("Expected a text payload");
    expect(refinementFor(parsed)).toEqual({
      instruction: "Make it shorter.",
      priorText: "The original post.",
    });
  });

  it("accepts image generation with reference images", () => {
    expect(
      CopywriterPayloadSchema.parse({
        mode: "image",
        briefText: "A clean product hero image.",
        tier: "hero",
        referenceImageUrls: ["https://example.com/product.png"],
      }),
    ).toMatchObject({ mode: "image", tier: "hero" });
  });

  it("requires one variant for every strategic angle", () => {
    const duplicateAngles = {
      variants: [
        { angle: "pain-led", body: "One" },
        { angle: "pain-led", body: "Two" },
        { angle: "contrarian", body: "Three" },
      ],
    };

    expect(VariantsSchema.safeParse(duplicateAngles).success).toBe(false);
  });
});
