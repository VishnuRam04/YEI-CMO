import { CmoChatPanel } from "@/components/agent-network/cmo-chat-panel";

/**
 * The conversation is the whole page. No heading above it: the CMO introduces
 * itself in the first message, so a static title only pushed the chat down.
 */
export default function CmoPage() {
  return (
    <div className="cmo-fullscreen">
      <CmoChatPanel variant="workspace" />
    </div>
  );
}
