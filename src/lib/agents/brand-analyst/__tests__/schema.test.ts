import { describe, expect, it } from "vitest";
import fixture from "./golden.fixture.json";
import {
  BrandAnalystModelResultSchema,
  BrandAnalystPayloadSchema,
} from "../schema";

describe("Brand Analyst schemas", () => {
  it("keeps the legacy URL payload compatible", () => {
    const parsed = BrandAnalystPayloadSchema.parse({
      url: "example.com",
      forceRefresh: false,
    });

    expect(parsed.sources).toEqual([
      expect.objectContaining({
        kind: "website",
        url: "https://example.com",
        label: "official-website",
      }),
    ]);
  });

  it("accepts a mixed-source onboarding payload", () => {
    const parsed = BrandAnalystPayloadSchema.parse(fixture.input);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[1]).toMatchObject({ kind: "text", label: "approved-copy" });
  });

  it("accepts structured context as the only evidence source", () => {
    const parsed = BrandAnalystPayloadSchema.parse({
      companyName: "Northwind",
      context: { industry: "B2B software", audiences: ["Marketing leaders"] },
    });
    expect(parsed.context?.industry).toBe("B2B software");
  });

  it("rejects a request with no usable source", () => {
    expect(BrandAnalystPayloadSchema.safeParse({ companyName: "Northwind" }).success).toBe(
      false,
    );
  });

  it("validates the golden structured model result", () => {
    expect(BrandAnalystModelResultSchema.parse(fixture.modelResult)).toEqual(
      fixture.modelResult,
    );
  });

  it("rejects malformed model output", () => {
    const malformed = structuredClone(fixture.modelResult);
    malformed.kernel.differentiators.pop();
    expect(BrandAnalystModelResultSchema.safeParse(malformed).success).toBe(false);
  });
});
