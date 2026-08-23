import { MODELS } from "@/lib/agents/models";
import { agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import type { CmoPayload, CmoResult } from "./schema";

export const cmoAgent: Agent<CmoPayload, CmoResult> = {
  id: "cmo",
  model: MODELS.cmo,

  async run(input) {
    // Day-2 contract stub. Dev A replaces only this middle section.
    return agentSuccess({
      agentId: "cmo",
      traceId: input.traceId,
      model: MODELS.cmo,
      result: {
        reply: "CMO agent contract is connected. Implementation pending.",
        intent: "clarify",
        delegations: [],
      },
      summary: "CMO stub ready",
    });
  },
};
