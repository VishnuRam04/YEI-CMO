import { describe, expect, it } from "vitest";
import fixture from "./golden.fixture.json";
import { buildInformationRequests } from "../gaps";
import { BrandAnalystModelResultSchema } from "../schema";

describe("Brand Analyst information requests", () => {
  it("classifies strategic gaps and source conflicts without inventing answers", () => {
    const modelResult = BrandAnalystModelResultSchema.parse(fixture.modelResult);
    modelResult.kernel.pricingPosture = null;
    modelResult.kernel.founderStory = null;
    modelResult.kernel.regulatedClaims = null;
    modelResult.conflicts = [{
      field: "kernel.category",
      options: [
        { value: "Marketing software", sourceIds: ["founder-notes"] },
        { value: "Agency services", sourceIds: ["website"] },
      ],
      question: "Which category is current?",
    }];

    const requests = buildInformationRequests({
      result: modelResult,
      reports: [],
      productCatalogues: [],
    });

    expect(requests[0]).toMatchObject({
      field: "kernel.category",
      severity: "blocking",
      resolution: "choose-conflict",
      options: ["Marketing software", "Agency services"],
    });
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "kernel.pricingPosture", severity: "review" }),
      expect.objectContaining({ field: "kernel.founderStory", severity: "optional" }),
      expect.objectContaining({ field: "kernel.regulatedClaims", severity: "review" }),
    ]));
  });

  it("requires a corrected upload when catalogue prices are missing", () => {
    const modelResult = BrandAnalystModelResultSchema.parse(fixture.modelResult);
    const requests = buildInformationRequests({
      result: modelResult,
      reports: [{
        id: "catalogue-1",
        kind: "document",
        label: "product-catalogue",
        title: "products.xlsx",
        status: "partial",
        warnings: ["Products: no Price column was found."],
      }],
      productCatalogues: [],
    });

    expect(requests).toContainEqual(expect.objectContaining({
      field: "kernel.productCatalogues",
      severity: "blocking",
      resolution: "upload-catalogue",
    }));
  });
});
