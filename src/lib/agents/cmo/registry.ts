import { z } from "zod";

/**
 * A capability the CMO can choose to use.
 *
 * Everything the orchestrator needs about an agent lives in one entry: how to
 * describe it to the model, what arguments it accepts, whether it is allowed
 * to run right now, and how to run it. Adding an agent is one entry here
 * rather than an enum, a prompt paragraph and a dispatch branch kept in sync
 * by hand.
 */
export interface Capability {
  id: string;
  title: string;
  /** One line the model reads when choosing. */
  purpose: string;
  /** When it is the right choice, and when it is not. */
  whenToUse: string;
  /** Arguments this capability reads, beyond the shared instruction. */
  args: readonly CapabilityArg[];
  /**
   * Refuses the call before it runs. Returning a string denies it, and that
   * string is handed back to the model as an observation so it can choose
   * something else rather than having its intent silently dropped.
   */
  guard?: (context: CapabilityGuardContext) => string | null;
}

export interface CapabilityArg {
  name: string;
  description: string;
}

export interface CapabilityGuardContext {
  planApproved: boolean;
  /** Capability ids already used in this turn, in order. */
  used: string[];
  args: CapabilityCallArgs;
}

/**
 * The shared argument shape. Capabilities read the fields they care about and
 * ignore the rest, which keeps the model's output schema concrete — a
 * per-capability union is far more likely to come back malformed.
 */
export const CapabilityCallArgsSchema = z.object({
  instruction: z.string().trim().min(1).max(4_000),
  url: z.string().trim().max(500).default(""),
  channel: z.enum(["linkedin", "instagram", "email", "none"]).default("none"),
  from: z.string().trim().max(40).default(""),
  to: z.string().trim().max(40).default(""),
  products: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  topics: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  horizon: z.enum(["sprint", "quarter"]).default("sprint"),
  campaignId: z.string().trim().max(160).default(""),
  reviewMode: z.enum(["preflight", "postflight"]).default("preflight"),
});

export type CapabilityCallArgs = z.infer<typeof CapabilityCallArgsSchema>;

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "analyst",
    title: "Analyst",
    purpose: "Researches the current market and reads imported performance metrics.",
    whenToUse:
      "Use to find out what is happening in the market, what competitors are doing, or how past posts performed. Do not use alongside the strategist: the strategist runs its own research first.",
    args: [
      { name: "topics", description: "Research themes to look into." },
      { name: "from / to", description: "ISO dates bounding stored metrics." },
    ],
    guard: ({ used }) =>
      used.includes("strategist")
        ? "The strategist has already run its own research this turn; running the analyst again would duplicate it."
        : null,
  },
  {
    id: "strategist",
    title: "Strategist",
    purpose:
      "Builds the full campaign plan: three options, a schedule and how to measure it. Runs market research first.",
    whenToUse:
      "Only once the user has asked for a plan or agreed to build one. Discussing an idea does not qualify.",
    args: [
      { name: "channel", description: "The channel the plan should run on." },
      { name: "horizon", description: "sprint for two weeks, quarter for three months." },
      { name: "products", description: "Product names, only if they exist in the confirmed catalogue." },
    ],
    guard: ({ planApproved, used }) => {
      if (!planApproved) {
        return "The user has not asked for or agreed to a plan yet. Discuss the idea and offer to build the plan instead.";
      }
      return used.includes("strategist")
        ? "A plan has already been built this turn."
        : null;
    },
  },
  {
    id: "copywriter",
    title: "Copywriter",
    purpose: "Writes posts, captions and emails, and generates poster images.",
    whenToUse:
      "Use when the user wants actual content written. Never in the same turn as the strategist: content follows an approved plan.",
    args: [{ name: "channel", description: "linkedin, instagram or email." }],
    guard: ({ used }) =>
      used.includes("strategist")
        ? "A plan was built this turn and needs the user's approval before any content is written."
        : null,
  },
  {
    id: "brand-analyst",
    title: "Brand Analyst",
    purpose: "Crawls the brand's website and rebuilds Brand Memory from it.",
    whenToUse:
      "Use when brand facts are missing or stale, or the user asks to re-read their site.",
    args: [{ name: "url", description: "The site to crawl. Defaults to the brand's own URL." }],
  },
  {
    id: "campaign-critic",
    title: "Campaign Critic",
    purpose: "Reviews a saved campaign before launch, or its results afterwards.",
    whenToUse:
      "Use for an explicit audit, readiness check, pre-flight or post-flight review of a campaign that already exists.",
    args: [
      { name: "reviewMode", description: "preflight before launch, postflight after results exist." },
      { name: "campaignId", description: "Optional; defaults to the most recent campaign." },
    ],
  },
] as const;

export function findCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}

export const CAPABILITY_IDS = CAPABILITIES.map((capability) => capability.id);

/** The specialist menu the model reads, generated from the registry. */
export function describeCapabilities(): string {
  return CAPABILITIES.map((capability) => {
    const args = capability.args.length
      ? `\n  arguments: ${capability.args.map((arg) => `${arg.name} — ${arg.description}`).join("; ")}`
      : "";
    return `- ${capability.id} (${capability.title}): ${capability.purpose}\n  when: ${capability.whenToUse}${args}`;
  }).join("\n");
}
