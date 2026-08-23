import { createAgentRoute } from "@/lib/agents/route";
import { cmoAgent } from "@/lib/agents/cmo";
import { CmoPayloadSchema } from "@/lib/agents/cmo/schema";

export const runtime = "nodejs";
export const POST = createAgentRoute(cmoAgent, CmoPayloadSchema);
