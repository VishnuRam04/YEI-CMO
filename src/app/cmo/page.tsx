import { CmoChatPanel } from "@/components/agent-network/cmo-chat-panel";
import { PageHeading } from "@/components/ui/page-heading";

export default function CmoPage() {
  return (
    <div className="page-wrap cmo-page">
      <PageHeading
        eyebrow="CMO workspace"
        title="Make the next marketing decision."
        description="Bring an idea, problem or goal. Your CMO will assess it, consult the right specialists and give you three clear ways forward."
      />
      <CmoChatPanel variant="workspace" />
    </div>
  );
}
