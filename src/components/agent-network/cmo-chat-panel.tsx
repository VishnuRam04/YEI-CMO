"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  Code2,
  LoaderCircle,
  Send,
  Sparkles,
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
    promising: "Promising — refine it",
    "needs-work": "Needs work",
    "not-recommended": "Not recommended",
  }[verdict];
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
  const [devTraceOpen, setDevTraceOpen] = useState(true);
  const [traceEvents, setTraceEvents] = useState<DevTraceEvent[]>([]);
  const [clock, setClock] = useState(() => Date.now());
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
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
                            onClick={() => void sendMessage(
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
                  {message.response.executionPlan && (
                    <details
                      className="cmo-execution-plan"
                      open={variant === "workspace" ? true : undefined}
                    >
                      <summary>
                        <span>
                          <b>Recommended execution plan</b>
                          <small>{message.response.executionPlan.cadence}</small>
                        </span>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="cmo-plan-body">
                        <div className="cmo-plan-overview">
                          <span><b>{message.response.executionPlan.totalAssets}</b> assets</span>
                          <span><b>{planDate(message.response.executionPlan.startDate)}</b> start</span>
                          <span><b>{planDate(message.response.executionPlan.endDate)}</b> review</span>
                          <span><b>{message.response.executionPlan.costLevel}</b> cost</span>
                        </div>
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
                                <em>Expected impact: {item.expectedImpact}</em>
                              </div>
                            </article>
                          ))}
                        </div>
                        <div className="cmo-plan-measurement">
                          <span><b>Primary metric</b>{message.response.executionPlan.measurement.primaryMetric}</span>
                          <span><b>Success threshold</b>{message.response.executionPlan.measurement.successThreshold}</span>
                          <span><b>Stop condition</b>{message.response.executionPlan.measurement.stopCondition}</span>
                          <span><b>Evidence basis</b>{message.response.executionPlan.planningBasis.replaceAll("-", " ")}</span>
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

        {status !== "idle" && (
          <div className="cmo-chat-thinking">
            <LoaderCircle size={13} />
            {latestTrace
              ? `${agentName(latestTrace.agentId)} · ${latestTrace.label}`
              : status === "thinking" ? "CMO is routing the request" : "Preparing response"}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

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
      </form>
    </aside>
  );
}
