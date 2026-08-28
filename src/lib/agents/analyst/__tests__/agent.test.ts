import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findBrand: vi.fn(),
  findMetrics: vi.fn(),
  findPatterns: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    brand: { findUnique: mocks.findBrand },
    metric: { findMany: mocks.findMetrics },
    pattern: { findMany: mocks.findPatterns },
  }),
}));

import { analystAgent } from "../index";
import { AnalystPayloadSchema } from "../schema";

describe("Analyst agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findBrand.mockResolvedValue({ name: "Northwind", kernel: { category: "B2B software" } });
    mocks.findPatterns.mockResolvedValue([]);
  });

  it("turns stored social metrics into supported and directional signals", async () => {
    mocks.findMetrics.mockResolvedValue(Array.from({ length: 10 }, () => ({
      channel: "linkedin",
      impressions: 1_000,
      clicks: 40,
      spend: 20,
      conversions: 4,
    })));
    const payload = AnalystPayloadSchema.parse({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-25T00:00:00.000Z",
    });

    const output = await analystAgent.run({ brandId: "brand-1", traceId: "trace-1", payload });

    expect(output.ok).toBe(true);
    expect(output.result?.stats.find((stat) => stat.label === "CTR")?.value).toBe(4);
    expect(output.result?.performanceSignals[0]).toMatchObject({
      channel: "linkedin",
      confidence: "supported",
      sampleSize: 10,
    });
    expect(output.result?.snapshotId).toBe("intel-trace-1");
    expect(output.result?.intelligenceParts.ownedPerformance).toMatchObject({
      status: "available",
      recordCount: 10,
    });
  });

  it("marks missing owned performance instead of inventing it", async () => {
    mocks.findMetrics.mockResolvedValue([]);
    const payload = AnalystPayloadSchema.parse({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-25T00:00:00.000Z",
    });
    const output = await analystAgent.run({ brandId: "brand-1", traceId: "trace-2", payload });

    expect(output.result?.performanceSignals).toEqual([]);
    expect(output.result?.missingData[0]).toContain("No owned social performance metrics");
    expect(output.result?.intelligenceParts.ownedPerformance.status).toBe("missing");
  });
});
