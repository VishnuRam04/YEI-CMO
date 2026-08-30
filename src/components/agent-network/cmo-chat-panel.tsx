"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CalendarCheck,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { CmoResponse } from "@/lib/agents/cmo/schema";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  delegations?: string[];
  response?: CmoResponse;
  presentation?: "conversation" | "brief";
};

type Brand = { id: string; name: string };
type ChatStatus = "idle" | "thinking" | "finishing";
type DevTraceStatus = "queued" | "working" | "completed" | "failed";
type DevTraceEvent = {
  type: "trace";
  id: string;
  traceId: string;
  agentId: "cmo" | "brand-analyst" | "analyst" | "strategist" | "copywriter" | "campaign-critic";
  stage: string;
  label: string;
  status: DevTraceStatus;
  timestamp: string;
  elapsedMs: number;
  detail?: unknown;
};

const suggestions = [
  "Explain our positioning",
  "Write a LinkedIn launch post",
  "What should we focus on next?",
  "Review our latest campaign before launch",
];

function newMessage(
  role: Message["role"],
  text: string,
  delegations?: string[],
  response?: CmoResponse,
  presentation?: Message["presentation"],
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    delegations,
    response,
    presentation,
  };
}

const conversationKey = (brandId: string) =>
  `northwind:cmo-conversation:${brandId}`;

function errorMessage(value: unknown): string {
  if (value && typeof value === "object") {
    const candidate = value as {
      message?: string;
      error?: { message?: string };
    };
    return candidate.error?.message ?? candidate.message ?? "Request failed.";
  }
  return "Request failed.";
}

function agentName(agentId: DevTraceEvent["agentId"]): string {
  return {
    cmo: "CMO",
    "brand-analyst": "Brand Analyst",
    analyst: "Analyst",
    strategist: "Strategist",
    copywriter: "Copywriter",
    "campaign-critic": "Campaign Critic",
  }[agentId];
}

function duration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${milliseconds}ms`
    : `${(milliseconds / 1_000).toFixed(1)}s`;
}

function planDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function traceContent(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "No structured content.";
  } catch {
    return "Trace content could not be serialised.";
  }
}

function verdictLabel(verdict: NonNullable<CmoResponse["verdict"]>): string {
  return {
    strong: "Strong idea",
    promising: "Good idea — improve it",
    "needs-work": "Needs a few changes",
    "not-recommended": "I would not use this idea",
  }[verdict];
}

function planningBasisLabel(basis: NonNullable<CmoResponse["executionPlan"]>["planningBasis"]): string {
  return {
    "owned-and-market-evidence": "Based on your past results and current market research.",
    "market-evidence-directional": "Based on current market research. Your own results are not available yet.",
    "brand-led-assumption": "A starting plan based on your brand information. We need results to learn what works best.",
  }[basis];
}

function researchDate(value: string): string {
  return new Date(value).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function researchCheckName(source: NonNullable<CmoResponse["researchEvidence"]>["checks"][number]["source"]): string {
  return {
    "google-grounded-search": "Google web search",
    "youtube-data": "YouTube public data",
    "meta-ad-library": "Meta Ad Library",
    "tiktok-creative-center": "TikTok Creative Center",
    "google-trends": "Google Trends",
  }[source];
}

function researchCheckStatus(status: NonNullable<CmoResponse["researchEvidence"]>["checks"][number]["status"]): string {
  return {
    active: "Checked",
    "search-only": "Checked through web search",
    unavailable: "Not connected",
    skipped: "Not needed for this request",
    failed: "Could not check",
  }[status];
}

function researchConfidence(value: number): string {
  if (value >= 0.8) return "Strong support";
  if (value >= 0.6) return "Useful signal";
  return "Early signal";
}

function plainResearchText(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}


/** What each agent is for, in the user's terms rather than the agent's id. */
const agentRoles: Record<string, string> = {
  cmo: "Deciding what is needed",
  "brand-analyst": "Reading your brand",
  analyst: "Researching the market",
  strategist: "Building the plan",
  copywriter: "Writing the content",
  "campaign-critic": "Reviewing the campaign",
};

type AgentStage = {
  agentId: DevTraceEvent["agentId"];
  label: string;
  status: DevTraceStatus;
  elapsedMs: number;
};

/** Latest state per agent, in the order they first appeared in the run. */
function agentStages(events: DevTraceEvent[]): AgentStage[] {
  const byAgent = new Map<string, AgentStage>();
  for (const event of events) {
    byAgent.set(event.agentId, {
      agentId: event.agentId,
      label: event.label,
      status: event.status,
      elapsedMs: event.elapsedMs,
    });
  }
  return [...byAgent.values()];
}

function AgentActivity({ events, running }: { events: DevTraceEvent[]; running: boolean }) {
  const stages = agentStages(events);
  if (stages.length === 0) return null;
  return (
    <div className={`agent-activity ${running ? "running" : "done"}`} aria-live="polite">
      {stages.map((stage) => (
        <div key={stage.agentId} className={`agent-chip ${stage.status}`}>
          <i />
          <span>
            <b>{agentName(stage.agentId)}</b>
            <small>{stage.status === "working"
              ? (agentRoles[stage.agentId] ?? stage.label)
              : stage.label}</small>
          </span>
          {stage.status === "completed" && <Check size={11} />}
          {stage.status === "failed" && <X size={11} />}
          {stage.status === "working" && <em>{duration(stage.elapsedMs)}</em>}
        </div>
      ))}
    </div>
  );
}


/**
 * A fixed estimate, not a live rate. Model prices are quoted in USD, so this
 * only converts them for reading; change it here or set NEXT_PUBLIC_MYR_PER_USD.
 */
const MYR_PER_USD = Number(process.env.NEXT_PUBLIC_MYR_PER_USD ?? "4.7");

function thousandsOfTokens(value: number): string {
  return value < 1_000
    ? `${value}`
    : `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
}

/** Sub-sen spend is the normal case, so two decimals would read as RM0.00. */
function ringgit(usdValue: number): string {
  const myr = usdValue * MYR_PER_USD;
  if (myr === 0) return "RM0.00";
  return myr < 0.01 ? `RM${myr.toFixed(4)}` : `RM${myr.toFixed(2)}`;
}

export function CmoChatPanel({
  open,
  onClose,
  variant = "drawer",
}: {
  open?: boolean;
  onClose?: () => void;
  variant?: "drawer" | "workspace";
}) {
  const visible = variant === "workspace" || Boolean(open);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [brandError, setBrandError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [devTraceEnabled, setDevTraceEnabled] = useState(false);
  const [devTraceOpen, setDevTraceOpen] = useState(false);
  const [traceEvents, setTraceEvents] = useState<DevTraceEvent[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [spend, setSpend] = useState({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  const [approvedPlan, setApprovedPlan] = useState<{
    campaignName: string;
    totalAssets: number;
    startDate: string;
    endDate: string;
    channel: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || brand || brandError) return;

    let cancelled = false;
    void fetch("/api/cmo")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(errorMessage(body));
        return body as { brand: Brand; devTraceEnabled?: boolean };
      })
      .then((body) => {
        if (!cancelled) {
          setBrand(body.brand);
          setDevTraceEnabled(Boolean(body.devTraceEnabled));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBrandError(
            error instanceof Error ? error.message : "Could not load the brand.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, brand, brandError]);

  useEffect(() => {
    if (!visible || !brand || historyReady) return;

    const storedId = window.localStorage.getItem(conversationKey(brand.id));
    if (!storedId) {
      setHistoryReady(true);
      return;
    }

    let cancelled = false;
    void fetch(`/api/cmo?conversationId=${encodeURIComponent(storedId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(errorMessage(body));
        return body as {
          conversationId: string | null;
          messages: Array<{
            id: string;
            role: "user" | "assistant";
            text: string;
            response: CmoResponse | null;
            presentation: "conversation" | "brief";
            delegations: string[];
          }>;
        };
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.conversationId) {
          window.localStorage.removeItem(conversationKey(brand.id));
          return;
        }

        setConversationId(body.conversationId);
        setMessages(body.messages.map((message) => ({
          ...message,
          response: message.response ?? undefined,
        })));
      })
      .catch((error) => {
        if (!cancelled) {
          setBrandError(
            error instanceof Error
              ? error.message
              : "Could not load CMO memory.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, brand, historyReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, traceEvents]);

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [status]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || !brand || !historyReady || status !== "idle") return;

    setMessages((current) => [...current, newMessage("user", message)]);
    setDraft("");
    setStatus("thinking");
    setTraceEvents([]);
    setClock(Date.now());

    try {
      const response = await fetch("/api/cmo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId: brand.id,
          traceId: crypto.randomUUID(),
          payload: {
            message,
            conversationId: conversationId ?? undefined,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(errorMessage(await response.json()));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedReply = false;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            state?: string;
            error?: { message?: string };
            id?: string;
            traceId?: string;
            agentId?: DevTraceEvent["agentId"];
            stage?: string;
            label?: string;
            status?: DevTraceStatus;
            timestamp?: string;
            elapsedMs?: number;
            detail?: unknown;
            output?: {
              ok: boolean;
              result?: {
                reply?: string;
                response?: CmoResponse;
                delegations?: string[];
                conversationId?: string;
                spend?: { inputTokens: number; outputTokens: number; costUsd: number };
                presentation?: "conversation" | "brief";
              };
              error?: { message?: string };
            };
          };

          if (
            event.type === "trace" &&
            event.id &&
            event.traceId &&
            event.agentId &&
            event.stage &&
            event.label &&
            event.status &&
            event.timestamp &&
            typeof event.elapsedMs === "number"
          ) {
            setTraceEvents((current) => [...current, event as DevTraceEvent]);
          }

          if (event.type === "state" && event.state === "working") {
            setStatus("finishing");
          }
          if (event.type === "error") {
            throw new Error(event.error?.message ?? "The CMO request failed.");
          }
          if (event.type === "done" && event.output?.ok) {
            const reply = event.output.result?.reply;
            if (!reply) throw new Error("The CMO returned an empty response.");
            const nextConversationId = event.output.result?.conversationId;
            if (nextConversationId) {
              setConversationId(nextConversationId);
              window.localStorage.setItem(
                conversationKey(brand.id),
                nextConversationId,
              );
            }
            const turn = event.output.result?.spend;
            if (turn) {
              setSpend((current) => ({
                inputTokens: current.inputTokens + turn.inputTokens,
                outputTokens: current.outputTokens + turn.outputTokens,
                costUsd: current.costUsd + turn.costUsd,
              }));
            }
            setMessages((current) => [
              ...current,
              newMessage(
                "assistant",
                reply,
                event.output?.result?.delegations,
                event.output?.result?.response,
                event.output?.result?.presentation,
              ),
            ]);
            receivedReply = true;
          }
        }

        if (done) break;
      }

      if (!receivedReply) throw new Error("The CMO response ended unexpectedly.");
    } catch (error) {
      setMessages((current) => [
        ...current,
        newMessage(
          "assistant",
          error instanceof Error
            ? error.message
            : "The CMO could not respond. Please retry.",
        ),
      ]);
    } finally {
      setStatus("idle");
    }
  }

  /**
   * Records the chosen option before continuing the conversation. The
   * Strategist only schedules its own recommended option, so the server
   * rebuilds the schedule around this one and the plan page picks it up.
   */
  async function chooseOption(response: CmoResponse, optionId: string, label: string) {
    const strategyId = response.executionPlan?.strategyId;
    if (strategyId && brand) {
      try {
        const saved = await fetch("/api/campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: brand.id, strategyId, optionId }),
        });
        const body = await saved.json();
        // Report the rebuilt plan, not the preview: choosing a different
        // option changes the channel, dates and number of posts.
        setApprovedPlan(saved.ok && body?.campaign
          ? {
              campaignName: body.campaign.executionPlan.campaignName,
              totalAssets: body.campaign.executionPlan.totalAssets,
              startDate: body.campaign.executionPlan.startDate,
              endDate: body.campaign.executionPlan.endDate,
              channel: body.campaign.executionPlan.schedule[0]?.channel ?? "",
            }
          : null);
      } catch {
        // A failed save must not block the reply; the chat still carries it.
        setApprovedPlan(null);
      }
    }
    await sendMessage(label);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  // Starts a fresh conversation rather than deleting anything: dropping the
  // stored id makes the next request omit conversationId, which the CMO
  // treats as a new thread. Earlier threads stay readable in the database.
  function clearChat() {
    if (status !== "idle") return;
    setMessages([]);
    setTraceEvents([]);
    setConversationId(null);
    setApprovedPlan(null);
    setSpend({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
    setDraft("");
    setBrandError("");
    if (brand) window.localStorage.removeItem(conversationKey(brand.id));
  }

  const latestTrace = traceEvents.at(-1);
  const liveElapsed = latestTrace && status !== "idle"
    ? Math.max(latestTrace.elapsedMs, clock - Date.parse(latestTrace.timestamp) + latestTrace.elapsedMs)
    : latestTrace?.elapsedMs ?? 0;

  return (
    <aside
      className={`cmo-chat-panel ${variant} ${visible ? "open" : ""}`}
      aria-hidden={!visible}
      aria-label="CMO conversation"
    >
      <header className="cmo-chat-header">
        <div className="cmo-chat-avatar"><BrainCircuit size={18} /></div>
        <div>
          <strong>CMO Agent</strong>
          <span><i /> {brand?.name ?? "Connecting to brand memory"}</span>
        </div>
        <div className="cmo-chat-actions">
          <button
            type="button"
            className="cmo-chat-clear"
            onClick={clearChat}
            disabled={status !== "idle" || messages.length === 0}
            title="Start a new conversation"
            aria-label="Clear the conversation and start a new one"
          >
            <Trash2 size={14} />
            <span>Clear</span>
          </button>
          {variant === "drawer" && (
            <button
              type="button"
              className="cmo-chat-close"
              onClick={onClose}
              aria-label="Close CMO chat"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {devTraceEnabled && (
        <section className={`cmo-dev-trace ${devTraceOpen ? "open" : ""}`}>
          <button
            type="button"
            className="cmo-dev-trace-toggle"
            onClick={() => setDevTraceOpen((current) => !current)}
            aria-expanded={devTraceOpen}
          >
            <Code2 size={13} />
            <span>
              <b>Dev trace</b>
              <small>
                {latestTrace
                  ? `${agentName(latestTrace.agentId)} · ${latestTrace.label}`
                  : "Ready to inspect the next request"}
              </small>
            </span>
            {status !== "idle" && <em>{duration(liveElapsed)}</em>}
            <ChevronDown size={13} />
          </button>

          {devTraceOpen && (
            <div className="cmo-dev-trace-body">
              <p>
                <Activity size={11} /> Operational stages, inputs and outputs. Private model reasoning and credentials are never shown.
              </p>
              {traceEvents.length === 0 ? (
                <div className="cmo-dev-trace-empty">Send a message to start the trace.</div>
              ) : (
                <div className="cmo-dev-trace-list">
                  {traceEvents.map((trace) => (
                    <details key={trace.id} className={`cmo-dev-trace-event ${trace.status}`}>
                      <summary>
                        <i />
                        <span>
                          <b>{agentName(trace.agentId)}</b>
                          <small>{trace.label}</small>
                        </span>
                        <time>{duration(trace.elapsedMs)}</time>
                      </summary>
                      <div>
                        <span>{trace.stage} · {trace.status}</span>
                        {trace.detail !== undefined && <pre>{traceContent(trace.detail)}</pre>}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="cmo-chat-messages" aria-live="polite">
        {brandError ? (
          <div className="cmo-chat-empty error">
            <strong>Brand memory unavailable</strong>
            <p>{brandError}</p>
          </div>
        ) : !historyReady ? (
          <div className="cmo-chat-thinking">
            <LoaderCircle size={13} />
            Loading conversation memory
          </div>
        ) : messages.length === 0 ? (
          <div className="cmo-chat-empty">
            <div className="cmo-chat-spark"><Sparkles size={17} /></div>
            <strong>What are we working on?</strong>
            <p>I can use your brand memory, direct specialists and explain the reasoning.</p>
            <div className="cmo-chat-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  disabled={!brand || !historyReady || status !== "idle"}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`cmo-chat-message ${message.role}`}
            >
              <span>{message.role === "assistant" ? "CMO" : "You"}</span>
              {message.role === "assistant" &&
              message.response &&
              message.presentation !== "conversation" ? (
                <div className="cmo-structured-response">
                  <h3>{message.response.title}</h3>
                  {message.response.verdict && (
                    <div className={`cmo-verdict ${message.response.verdict}`}>
                      {verdictLabel(message.response.verdict)}
                    </div>
                  )}
                  <p>{message.response.executiveSummary}</p>
                  {message.response.options.length > 0 ? (
                    <div className="cmo-options">
                      {message.response.options.map((option, index) => {
                        const recommended = option.id === message.response?.recommendedOptionId;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={recommended ? "recommended" : ""}
                            onClick={() => void chooseOption(
                              message.response!,
                              option.id,
                              `I choose option ${index + 1}, "${option.title}": ${option.summary}. Treat this as the approved direction and ask only for execution details you still need.`,
                            )}
                            disabled={status !== "idle" || Boolean(message.response?.clarification)}
                          >
                            <span>
                              <i>{index + 1}</i>
                              <b>{option.title}</b>
                              {recommended && <em>Best fit</em>}
                            </span>
                            <p>{option.summary}</p>
                            <small>
                              <span>{option.cost} cost</span>
                              <span>{option.risk} risk</span>
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : message.response.keyPoints.length > 0 && (
                    <ul>
                      {message.response.keyPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}
                  {message.response.researchEvidence && (
                    <details className="cmo-research-evidence">
                      <summary>
                        <Globe2 size={14} />
                        <span>
                          <b>What the Analyst found</b>
                          <small>
                            {message.response.researchEvidence.sources.length} public sources checked on {researchDate(message.response.researchEvidence.searchedAt)}
                          </small>
                        </span>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="cmo-research-body">
                        <p>{message.response.researchEvidence.summary}</p>

                        {message.response.researchEvidence.report && (
                          <details className="cmo-research-report">
                            <summary>Read the full Google research notes <ChevronDown size={11} /></summary>
                            <p>{plainResearchText(message.response.researchEvidence.report)}</p>
                          </details>
                        )}

                        {message.response.researchEvidence.findings.length > 0 ? (
                          <div className="cmo-research-findings">
                            {message.response.researchEvidence.findings.map((finding, index) => (
                              <article key={finding.id}>
                                <header>
                                  <b>Finding {index + 1}</b>
                                  <span>{researchConfidence(finding.confidence)}</span>
                                </header>
                                <p>{plainResearchText(finding.finding)}</p>
                                <div>
                                  <b>What this means for the business</b>
                                  <p>{plainResearchText(finding.businessMeaning)}</p>
                                </div>
                                {finding.sourceUrls.length > 0 && (
                                  <nav aria-label={`Sources for finding ${index + 1}`}>
                                    {finding.sourceUrls.map((url) => {
                                      const source = message.response?.researchEvidence?.sources.find((item) => item.url === url);
                                      return (
                                        <a href={url} target="_blank" rel="noreferrer" key={url}>
                                          {source?.title ?? "Open source"} <ExternalLink size={9} />
                                        </a>
                                      );
                                    })}
                                  </nav>
                                )}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="cmo-research-empty">No cited web finding was available for this request.</div>
                        )}

                        {message.response.researchEvidence.sources.length > 0 && (
                          <section className="cmo-research-sources">
                            <b>Public sources</b>
                            <div>
                              {message.response.researchEvidence.sources.map((source) => (
                                <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                                  <span>{source.title}</span>
                                  <ExternalLink size={10} />
                                </a>
                              ))}
                            </div>
                          </section>
                        )}

                        <section className="cmo-research-checks">
                          <b>Competitor and platform checks</b>
                          {message.response.researchEvidence.checks.map((check) => (
                            <div key={check.source} className={check.status}>
                              <span><b>{researchCheckName(check.source)}</b><small>{check.detail}</small></span>
                              <em>{researchCheckStatus(check.status)}</em>
                            </div>
                          ))}
                        </section>

                        {message.response.researchEvidence.caveats.length > 0 && (
                          <section className="cmo-research-caveats">
                            <b>What could not be checked</b>
                            {message.response.researchEvidence.caveats.map((caveat) => <p key={caveat}>{caveat}</p>)}
                          </section>
                        )}
                      </div>
                    </details>
                  )}
                  {message.response.executionPlan && (
                    <details
                      className="cmo-execution-plan"
                      open={variant === "workspace" ? true : undefined}
                    >
                      <summary>
                        <span>
                          <b>What the best-fit option looks like</b>
                          <small>{message.response.executionPlan.cadence}</small>
                        </span>
                      </summary>
                      <div className="cmo-plan-body">
                        <div className="cmo-plan-overview">
                          <span><b>{message.response.executionPlan.totalAssets}</b> posts</span>
                          <span><b>{planDate(message.response.executionPlan.startDate)}</b> starts</span>
                          <span><b>{planDate(message.response.executionPlan.endDate)}</b> ends</span>
                          <span><b>{message.response.executionPlan.costLevel}</b> cost</span>
                        </div>
                        <p className="cmo-plan-note">
                          This is the draft for the best-fit option. Pick an
                          option below and I will schedule it properly — the
                          full plan then opens on the Plan page.
                        </p>
                        <div className="cmo-plan-schedule">
                          {message.response.executionPlan.schedule.map((item) => (
                            <article key={`${item.sequence}-${item.date}`}>
                              <time className="cmo-plan-date">
                                <b>{item.day}</b>
                                <small>{planDate(item.date)} · {item.publishTimeLocal}</small>
                              </time>
                              <div className="cmo-plan-content">
                                <small>{item.channel} · {item.assetType}</small>
                                <b>{item.theme}</b>
                                <p>{item.action}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                        <div className="cmo-plan-measurement">
                          <span><b>What to watch</b>{message.response.executionPlan.measurement.primaryMetric}</span>
                          <span><b>A good result</b>{message.response.executionPlan.measurement.successThreshold}</span>
                          <span><b>When to pause</b>{message.response.executionPlan.measurement.stopCondition}</span>
                          <span><b>How this plan was made</b>{planningBasisLabel(message.response.executionPlan.planningBasis)}</span>
                          <p>{message.response.executionPlan.measurement.timingBasis}</p>
                        </div>
                      </div>
                    </details>
                  )}
                  <div className="cmo-next-step">
                    <Sparkles size={12} />
                    <span><b>Next step</b>{message.response.nextStep}</span>
                  </div>
                  {message.response.clarification && (
                    <div className="cmo-clarification-actions">
                      {message.response.clarification.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => void sendMessage(option)}
                          disabled={status !== "idle"}
                        >
                          {option}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void sendMessage("Skip this")}
                        disabled={status !== "idle"}
                      >
                        Skip for now
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p>{message.text}</p>
              )}
              {message.delegations && message.delegations.length > 0 && (
                <small>Delegated to {message.delegations.join(", ")}</small>
              )}
            </article>
          ))
        )}

        {status !== "idle" && traceEvents.length === 0 && (
          <div className="cmo-chat-thinking">
            <LoaderCircle size={13} />
            {status === "thinking" ? "CMO is routing the request" : "Preparing response"}
          </div>
        )}
        {/* Who is working, and on what, while the request runs. */}
        <AgentActivity events={traceEvents} running={status !== "idle"} />
        <div ref={messagesEndRef} />
      </div>

      {approvedPlan && (
        <section className="cmo-plan-ready">
          <header>
            <CalendarCheck size={15} />
            <div>
              <b>{approvedPlan.campaignName} is scheduled</b>
              <small>
                {approvedPlan.totalAssets} posts on {approvedPlan.channel} ·{" "}
                {planDate(approvedPlan.startDate)} – {planDate(approvedPlan.endDate)}
              </small>
            </div>
          </header>
          <p>
            The full day-by-day plan is on the Plan page. Every post there has a
            <b> Write it</b> button — the Copywriter drafts that post&apos;s words
            and makes its image from the plan, so you never start from a blank page.
          </p>
          <a className="cmo-plan-link" href="/plan">
            Open the full plan <ArrowRight size={13} />
          </a>
        </section>
      )}

      <form className="cmo-chat-form" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          placeholder={brand ? "Ask your CMO…" : "Loading brand memory…"}
          disabled={
            !brand || !historyReady || Boolean(brandError) || status !== "idle"
          }
          aria-label="Message the CMO"
        />
        <button
          type="submit"
          disabled={!brand || !historyReady || !draft.trim() || status !== "idle"}
          aria-label="Send message"
        >
          <Send size={15} />
        </button>
        <small>Enter to send · Shift + Enter for a new line</small>
        {/* Always shown, including at zero: a greeting is answered without a
            model call, and hiding the counter then reads as broken. */}
        <small
          className="cmo-spend"
          title={`${spend.inputTokens.toLocaleString("en-GB")} in · ${spend.outputTokens.toLocaleString("en-GB")} out · estimated at RM${MYR_PER_USD} to the US dollar`}
        >
          {thousandsOfTokens(spend.inputTokens + spend.outputTokens)} tokens
          {" · est. "}
          <b>{ringgit(spend.costUsd)}</b>
        </small>
      </form>
    </aside>
  );
}
