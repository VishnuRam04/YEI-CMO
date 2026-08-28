import { createAgentRoute } from "@/lib/agents/route";
import { strategistAgent } from "@/lib/agents/strategist";
import { StrategistPayloadSchema } from "@/lib/agents/strategist/schema";

export const runtime = "nodejs";
export const POST = createAgentRoute(strategistAgent, StrategistPayloadSchema);
