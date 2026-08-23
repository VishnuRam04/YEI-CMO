import { analystAgent } from "@/lib/agents/analyst";
import { AnalystPayloadSchema } from "@/lib/agents/analyst/schema";
import { createAgentRoute } from "@/lib/agents/route";

export const runtime = "nodejs";
export const POST = createAgentRoute(analystAgent, AnalystPayloadSchema);
