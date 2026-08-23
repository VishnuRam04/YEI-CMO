import { copywriterAgent } from "@/lib/agents/copywriter";
import { CopywriterPayloadSchema } from "@/lib/agents/copywriter/schema";
import { createAgentRoute } from "@/lib/agents/route";

export const runtime = "nodejs";
export const POST = createAgentRoute(copywriterAgent, CopywriterPayloadSchema);
