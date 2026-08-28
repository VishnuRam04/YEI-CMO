import { describe, expect, it, vi } from "vitest";
import fixture from "./golden.fixture.json";

const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({ brand: { findUnique } }),
}));

import { buildConfirmedBrandProfile } from "../confirm";
import {
  BrandAnalystModelResultSchema,
  BrandAnalystPayloadSchema,
} from "../schema";

describe("Brand Analyst clarification confirmation", () => {
  it("stores the answer as first-party evidence and updates a known kernel field", async () => {
    const modelResult = BrandAnalystModelResultSchema.parse(fixture.modelResult);
    findUnique.mockResolvedValue({
      name: "Northwind Labs",
      kernel: {
        ...modelResult.kernel,
        visualIdentity: modelResult.visualIdentity,
        productCatalogues: [],
        provenance: {
          crawledUrls: ["https://northwind.example"],
          sources: [],
          evidence: [],
          conflicts: [],
          missingInformation: ["Pricing posture"],
          informationRequests: [
            {
              id: "request-1-kernel-pricingposture",
              field: "kernel.pricingPosture",
              severity: "review",
              resolution: "ask-user",
              reason: "Pricing posture is missing.",
              affects: ["price-objection copy"],
              canResearch: false,
              question: "How should customers understand your pricing position?",
              options: ["Value-led", "Premium value"],
            },
            {
              id: "request-2-kernel-founderstory",
              field: "kernel.founderStory",
              severity: "optional",
              resolution: "ask-user",
              reason: "Founder story is missing.",
              affects: ["founder-led content"],
              canResearch: false,
              question: "What is the confirmed founder story?",
              options: [],
            },
          ],
        },
      },
      voice: modelResult.voice,
    });
    const payload = BrandAnalystPayloadSchema.parse({
      clarification: {
        requestId: "request-1-kernel-pricingposture",
        field: "kernel.pricingPosture",
        question: "How should customers understand your pricing position?",
        answer: "Premium value with high-touch support",
        conversationId: "conversation-1",
      },
    });

    const result = await buildConfirmedBrandProfile("brand-1", payload);

    expect(result.kernel.pricingPosture).toMatchObject({
      position: "premium",
      summary: "Premium value with high-touch support",
    });
    expect(result.confirmedInformation[0]).toMatchObject({
      field: "kernel.pricingPosture",
      value: "Premium value with high-touch support",
      conversationId: "conversation-1",
    });
    expect(result.evidence.at(-1)).toMatchObject({
      field: "kernel.pricingPosture",
      confidence: 1,
    });
    expect(result.missingInformation).not.toContain("Pricing posture");
    expect(result.informationRequests).toEqual([
      expect.objectContaining({ field: "kernel.founderStory" }),
    ]);
  });
});
