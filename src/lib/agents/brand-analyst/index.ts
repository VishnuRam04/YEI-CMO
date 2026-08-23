import { MODELS } from "@/lib/agents/models";
import { agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import type { BrandAnalystPayload, BrandAnalystResult } from "./schema";

export const brandAnalystAgent: Agent<
  BrandAnalystPayload,
  BrandAnalystResult
> = {
  id: "brand-analyst",
  model: MODELS.brandAnalyst,

  async run(input) {
    // Day-2 contract stub. Dev B adds crawling, extraction, validation and DB upsert.
    return agentSuccess({
      agentId: "brand-analyst",
      traceId: input.traceId,
      model: MODELS.brandAnalyst,
      result: {
        kernel: {
          positioning: "Pending extraction",
          category: "Pending extraction",
          icps: [
            { name: "ICP 1", needs: ["Pending extraction"] },
            { name: "ICP 2", needs: ["Pending extraction"] },
          ],
          differentiators: ["Pending 1", "Pending 2", "Pending 3"],
          objections: [1, 2, 3].map((number) => ({
            objection: `Pending ${number}`,
            rebuttal: `Pending ${number}`,
          })),
          proofPoints: [],
          competitors: [],
        },
        voice: {
          toneAxes: {},
          do: [],
          dont: [],
          bannedWords: [],
          exemplars: Array.from({ length: 5 }, (_, index) => `Pending ${index + 1}`),
        },
        crawledUrls: [input.payload.url],
      },
      summary: "Brand Analyst stub ready",
    });
  },
};
