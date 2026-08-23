import { describe, expect, it } from "vitest";
import { agentSuccess } from "../output";
import { runAgent } from "../run";
import type { Agent } from "../types";

describe("runAgent", () => {
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
});
