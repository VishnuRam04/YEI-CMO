import { MODELS } from "@/lib/agents/models";
import { agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import type { CopywriterPayload, CopywriterResult } from "./schema";

export const copywriterAgent: Agent<CopywriterPayload, CopywriterResult> = {
  id: "copywriter",
  model: MODELS.copywriter,

  async run(input) {
    // Day-2 contract stub. Dev C replaces variants with validated model output.
    const variants = (["pain-led", "proof-led", "contrarian"] as const).map(
      (angle) => ({ angle, body: `[${angle}] ${input.payload.brief}` }),
    );

    return agentSuccess({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      result: { variants, usedKernel: input.payload.usedKernel },
      summary: "3 variants · stub",
    });
  },
};
