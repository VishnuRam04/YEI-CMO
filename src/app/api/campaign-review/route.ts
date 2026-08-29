import { campaignCriticAgent } from "@/lib/agents/campaign-critic";
import { CampaignCriticPayloadSchema } from "@/lib/agents/campaign-critic/schema";
import { createAgentRoute } from "@/lib/agents/route";

export const runtime = "nodejs";
export const POST = createAgentRoute(campaignCriticAgent, CampaignCriticPayloadSchema);
