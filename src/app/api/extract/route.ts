import { brandAnalystAgent } from "@/lib/agents/brand-analyst";
import { BrandAnalystPayloadSchema } from "@/lib/agents/brand-analyst/schema";
import { createAgentRoute } from "@/lib/agents/route";

export const runtime = "nodejs";
export const POST = createAgentRoute(brandAnalystAgent, BrandAnalystPayloadSchema);
