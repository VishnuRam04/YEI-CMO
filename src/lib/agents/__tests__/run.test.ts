import { afterEach, describe, expect, it, vi } from "vitest";
import { agentSuccess } from "../output";
import { runAgent } from "../run";
import type { Agent } from "../types";

describe("runAgent", () => {
  afterEach(() => vi.useRealTimers());

  it("normalises identity, summary and telemetry", async () => {
    const agent: Agent<{ value: string }, { value: string }> = {
      id: "copywriter",
      model: "gemini-2.5-flash",
      async run(input) {
        return agentSuccess({
          agentId: "copywriter",
          traceId: input.traceId,
          model: "gemini-2.5-flash",
          result: input.payload,
          summary: "x".repeat(50),
          inputTokens: 100,
          outputTokens: 50,
        });
      },
    };

    const output = await runAgent(agent, {
      brandId: "brand_1",
      traceId: "trace_1",
      payload: { value: "ok" },
    });

    expect(output.ok).toBe(true);
    expect(output.summary).toHaveLength(40);
    expect(output.telemetry.costUsd).toBeGreaterThan(0);
    expect(output.telemetry.finishedAt).not.toBe("");
  });

  it("allows Brand Analyst runs to exceed the old 30-second ceiling", async () => {
    vi.useFakeTimers();
    const agent: Agent<Record<string, never>, { saved: boolean }> = {
      id: "brand-analyst",
      model: "gemini-3.1-pro-preview",
      async run(input) {
        await new Promise((resolve) => setTimeout(resolve, 35_000));
        return agentSuccess({
          agentId: "brand-analyst",
          traceId: input.traceId,
          model: "gemini-3.1-pro-preview",
          result: { saved: true },
          summary: "Brand saved",
        });
      },
    };

    const pending = runAgent(agent, {
      brandId: "brand_1",
      traceId: "trace_long",
      payload: {},
    });
    await vi.advanceTimersByTimeAsync(35_000);

    await expect(pending).resolves.toMatchObject({
      ok: true,
      result: { saved: true },
    });
  });
});
