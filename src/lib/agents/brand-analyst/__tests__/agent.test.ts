import { describe, expect, it, vi } from "vitest";
import fixture from "./golden.fixture.json";

vi.mock("../extract", () => ({ extractBrandProfile: vi.fn() }));
vi.mock("../persist", () => ({ persistBrandProfile: vi.fn() }));
vi.mock("../confirm", () => ({ buildConfirmedBrandProfile: vi.fn() }));

import { createBrandAnalystAgent } from "../index";
import {
  BrandAnalystModelResultSchema,
  BrandAnalystPayloadSchema,
} from "../schema";
import type { PreparedSources } from "../sources";

const payload = BrandAnalystPayloadSchema.parse(fixture.input);
const modelResult = BrandAnalystModelResultSchema.parse(fixture.modelResult);
const prepared: PreparedSources = {
  sources: [
    {
      id: "founder-notes",
      kind: "text",
      label: "approved-copy",
      title: "Founder notes",
      authority: "user-confirmed",
      origin: "user-input://founder-notes",
      text: "Northwind gives lean B2B marketing teams an operating layer.",
      hasFile: false,
      warnings: [],
      checksum: "abc123",
      crawledUrls: [],
    },
  ],
  reports: [
    {
      id: "founder-notes",
      kind: "text",
      label: "approved-copy",
      title: "Founder notes",
      status: "processed",
      warnings: [],
    },
  ],
  crawledUrls: [],
  productCatalogues: [],
};

describe("Brand Analyst agent", () => {
  it("extracts, persists, and returns token telemetry", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const agent = createBrandAnalystAgent({
      prepareSources: vi.fn().mockResolvedValue(prepared),
      extract: vi.fn().mockResolvedValue({
        result: modelResult,
        inputTokens: 450,
        outputTokens: 220,
      }),
      persist,
    });

    const output = await agent.run({
      brandId: "brand-1",
      traceId: "trace-1",
      payload,
    });

    expect(output.ok).toBe(true);
    expect(output.result?.kernel.positioning).toContain("AI operating layer");
    expect(output.result?.voice.requiredWords).toContain("agentic CMO workspace");
    expect(output.result?.voice.bannedWords).toContain("revolutionary");
    expect(output.result?.visualIdentity.fontFamilies).toContain("Inter");
    expect(output.result?.visualIdentity.usageNotes).toContain(
      "Approved visual direction: Use editorial layouts with generous whitespace.",
    );
    expect(output.telemetry.inputTokens).toBe(450);
    expect(output.telemetry.outputTokens).toBe(220);
    expect(persist).toHaveBeenCalledWith(
      "brand-1",
      payload,
      expect.objectContaining({ brandName: "Northwind Labs" }),
      "trace-1",
    );
  });

  it("returns a useful input error when every source fails", async () => {
    const agent = createBrandAnalystAgent({
      prepareSources: vi.fn().mockResolvedValue({
        sources: [],
        crawledUrls: [],
        reports: [
          {
            id: "source-1",
            kind: "website",
            label: "official-website",
            title: "https://example.com",
            status: "failed",
            warnings: ["Source returned HTTP 403."],
          },
        ],
      }),
    });

    const output = await agent.run({
      brandId: "brand-1",
      traceId: "trace-2",
      payload,
    });

    expect(output.ok).toBe(false);
    expect(output.error).toMatchObject({
      code: "INPUT_ERROR",
      retryable: false,
    });
    expect(output.error?.detail).toContain("HTTP 403");
  });

  it("does not invent a Brand Kernel from a logo alone", async () => {
    const agent = createBrandAnalystAgent({
      prepareSources: vi.fn().mockResolvedValue({
        sources: [
          {
            ...prepared.sources[0],
            id: "logo-1",
            kind: "image",
            label: "company-logo",
            title: "Logo",
            origin: "upload://logo.png",
            text: undefined,
          },
        ],
        crawledUrls: [],
        reports: [
          {
            id: "logo-1",
            kind: "image",
            label: "company-logo",
            title: "Logo",
            status: "processed",
            warnings: [],
          },
        ],
      }),
    });

    const output = await agent.run({
      brandId: "brand-1",
      traceId: "trace-logo",
      payload,
    });

    expect(output.ok).toBe(false);
    expect(output.error?.message).toContain("cannot establish the Brand Kernel");
  });
});
