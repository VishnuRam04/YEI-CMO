import { describe, expect, it } from "vitest";
import fixture from "./golden.fixture.json";
import {
  BrandAnalystModelResultSchema,
  BrandAnalystPayloadSchema,
  BrandVoiceSchema,
  ProductCatalogueSchema,
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
      context: {
        industry: "B2B software",
        audiences: ["Marketing leaders"],
        pricingPosture: "Premium operational value",
        founderStory: "Founded by Alex Kim after seeing fragmented workflows.",
        regulatoryStatus: "unsure",
        regulatedDomains: ["Advertising performance claims"],
        fontNames: ["Inter", "Canela"],
        visualGuidance: "Use editorial compositions.",
        avoidVisualGuidance: "Avoid generic stock photography.",
      },
    });
    expect(parsed.context?.industry).toBe("B2B software");
    expect(parsed.context?.pricingPosture).toContain("Premium");
    expect(parsed.context?.founderStory).toContain("Alex Kim");
    expect(parsed.context?.regulatoryStatus).toBe("unsure");
    expect(parsed.context?.fontNames).toEqual(["Inter", "Canela"]);
  });

  it("accepts long-form required and banned language guidance", () => {
    const longGuidance = "Use this language rule. ".repeat(200);
    const parsed = BrandAnalystPayloadSchema.parse({
      companyName: "Northwind",
      context: {
        requiredWords: [longGuidance],
        bannedWords: [longGuidance],
      },
    });

    expect(parsed.context?.requiredWords[0]).toHaveLength(longGuidance.trim().length);
    expect(parsed.context?.bannedWords[0]).toHaveLength(longGuidance.trim().length);
    const voice = BrandVoiceSchema.parse({
      requiredWords: [longGuidance],
      bannedWords: [longGuidance],
    });
    expect(voice.requiredWords[0]).toHaveLength(longGuidance.trim().length);
    expect(voice.bannedWords[0]).toHaveLength(longGuidance.trim().length);
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

  it("keeps the three strategic fields explicit when evidence is absent", () => {
    const legacy = structuredClone(fixture.modelResult);
    delete (legacy.kernel as Partial<typeof legacy.kernel>).pricingPosture;
    delete (legacy.kernel as Partial<typeof legacy.kernel>).founderStory;
    delete (legacy.kernel as Partial<typeof legacy.kernel>).regulatedClaims;

    const parsed = BrandAnalystModelResultSchema.parse(legacy);
    expect(parsed.kernel.pricingPosture).toBeNull();
    expect(parsed.kernel.founderStory).toBeNull();
    expect(parsed.kernel.regulatedClaims).toBeNull();
  });

  it("accepts sparse evidence without forcing the model to invent list items", () => {
    const sparse = structuredClone(fixture.modelResult);
    sparse.kernel.icps = [];
    sparse.kernel.differentiators = [];
    sparse.kernel.objections = [];
    sparse.voice.exemplars = [];
    expect(BrandAnalystModelResultSchema.safeParse(sparse).success).toBe(true);
  });

  it("validates structured catalogue products and listed prices", () => {
    const catalogue = ProductCatalogueSchema.parse({
      sourceId: "catalogue-1",
      fileName: "products.xlsx",
      sheetNames: ["Products"],
      totalRows: 1,
      products: [{
        name: "Focus Blend",
        sku: "FOCUS-01",
        price: 129,
        currency: "MYR",
        sheet: "Products",
        sourceRow: 2,
      }],
    });

    expect(catalogue.products[0]).toMatchObject({
      name: "Focus Blend",
      price: 129,
      currency: "MYR",
      availability: null,
    });
  });
});
