import { describe, expect, it } from "vitest";
import { analystAgent } from "../index";
import { AnalystResultSchema } from "../schema";

describe("Analyst agent", () => {
  it("returns a typed digest with meaningful stats and patterns", async () => {
    const result = await analystAgent.run({
      brandId: "brand_123",
      traceId: "trace_123",
      payload: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.result).not.toBeNull();
    expect(result.summary.length).toBeLessThanOrEqual(40);
    expect(result.result).toMatchObject({
      stats: expect.any(Array),
      patterns: expect.any(Array),
      digest: expect.any(String),
    });
    expect(result.result!.stats.length).toBeGreaterThanOrEqual(4);
    expect(result.result!.patterns.length).toBeGreaterThanOrEqual(2);

    expect(() => AnalystResultSchema.parse(result.result)).not.toThrow();
  });
});
