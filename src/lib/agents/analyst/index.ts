import { MODELS } from "@/lib/agents/models";
import { agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import type { AnalystPayload, AnalystResult } from "./schema";

export const analystAgent: Agent<AnalystPayload, AnalystResult> = {
  id: "analyst",
  model: MODELS.analyst,

  async run(input) {
    // Day-2 contract stub. Dev D adds SQL aggregation before narrative generation.
    return agentSuccess({
      agentId: "analyst",
      traceId: input.traceId,
      model: MODELS.analyst,
      result: {
        stats: [],
        patterns: [],
        digest: `Analyst stub ready for ${input.payload.from} to ${input.payload.to}.`,
      },
      summary: "Analyst stub ready",
    });
  },
};
