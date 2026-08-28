import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./golden.fixture.json";

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({ brand: { findUnique, upsert } }),
}));

import { persistBrandProfile } from "../persist";
import {
  BrandAnalystModelResultSchema,
  BrandAnalystPayloadSchema,
  BrandAnalystResultSchema,
} from "../schema";

describe("Brand Analyst persistence", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
  });

  it("upserts the fast-read kernel, voice, visual identity, and provenance", async () => {
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({ id: "brand-1" });
    const payload = BrandAnalystPayloadSchema.parse(fixture.input);
    const modelResult = BrandAnalystModelResultSchema.parse(fixture.modelResult);
    const result = BrandAnalystResultSchema.parse({
      ...modelResult,
      crawledUrls: ["https://northwind.example"],
      sources: [
        {
          id: "founder-notes",
          kind: "text",
          label: "approved-copy",
          title: "Founder notes",
          status: "processed",
          warnings: [],
        },
      ],
      productCatalogues: [{
        sourceId: "founder-notes",
        fileName: "products.xlsx",
        sheetNames: ["Products"],
        totalRows: 1,
        products: [{
          name: "Northwind Plan",
          price: 499,
          currency: "USD",
          sheet: "Products",
          sourceRow: 2,
        }],
        warnings: [],
      }],
    });

    await persistBrandProfile("brand-1", payload, result, "trace-1");

    expect(upsert).toHaveBeenCalledOnce();
    const call = upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({
      id: "brand-1",
      name: "Northwind Labs",
      url: "https://northwind.example",
    });
    expect(call.create.kernel).toMatchObject({
      positioning: modelResult.kernel.positioning,
      visualIdentity: modelResult.visualIdentity,
      provenance: {
        traceId: "trace-1",
        crawledUrls: ["https://northwind.example"],
      },
      productCatalogues: [expect.objectContaining({
        fileName: "products.xlsx",
        products: [expect.objectContaining({ name: "Northwind Plan", price: 499 })],
      })],
    });
    expect(call.create.voice).toMatchObject({
      exemplars: modelResult.voice.exemplars,
      provenance: { traceId: "trace-1" },
    });
  });
});
