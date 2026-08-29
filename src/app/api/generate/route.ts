import { copywriterAgent } from "@/lib/agents/copywriter";
import { CopywriterPayloadSchema } from "@/lib/agents/copywriter/schema";
import { createAgentRoute } from "@/lib/agents/route";

export const runtime = "nodejs";
// Copy is generated and then judged against brand memory, so a request
// carries two model calls and may retry.
export const maxDuration = 180;
export const POST = createAgentRoute(copywriterAgent, CopywriterPayloadSchema);
