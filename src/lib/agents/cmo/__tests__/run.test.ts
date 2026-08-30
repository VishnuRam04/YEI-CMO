import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findCampaign: vi.fn(),
  generateText: vi.fn(),
  runAgent: vi.fn(),
  getOrCreateConversation: vi.fn(),
  loadContext: vi.fn(),
  loadPendingClarification: vi.fn(),
  loadPendingPlanOffer: vi.fn(),
  campaignUpsert: vi.fn(),
  saveExchange: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    brand: { findUnique: mocks.findUnique },
    // The pipeline records the built plan and the critic reads it back;
    // storage itself is covered by the campaign store's own tests.
    campaign: {
      upsert: mocks.campaignUpsert,
      findFirst: mocks.findCampaign,
    },
  }),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

vi.mock("@/lib/agents/run", () => ({ runAgent: mocks.runAgent }));
vi.mock("../memory", () => ({
  getOrCreateCmoConversation: mocks.getOrCreateConversation,
  loadCmoContext: mocks.loadContext,
  loadPendingClarification: mocks.loadPendingClarification,
  loadPendingPlanOffer: mocks.loadPendingPlanOffer,
  saveCmoExchange: mocks.saveExchange,
}));

import {
  agreesToPlanOffer,
  catalogueBackedSelectors,
  cmoAgent,
  explicitPlanRequest,
  explicitProductSelectors,
} from "../index";

const brand = {
  id: "brand_1",
  name: "Northwind",
  url: "https://example.com",
  kernel: { positioning: "One shared memory" },
  voice: { bannedWords: ["revolutionary"] },
  directives: [{ statement: "Prioritise qualified conversations" }],
};

const input = {
  brandId: "brand_1",
  traceId: "trace_1",
  payload: { message: "What is our positioning?", recentActivity: [] },
};

const usage = { inputTokens: 20, outputTokens: 10 };
const response = {
  title: "Protect the strategic signal",
  executiveSummary: "Northwind should lead with its shared-memory advantage.",
  keyPoints: ["The Brand Kernel aligns every specialist."],
  options: [],
  recommendation: "Prioritise proof of learning over raw content volume.",
  planOffer: false,
  nextStep: "Draft one launch narrative around the learning loop.",
};


/** A loop decision the model would return. */
const respond = (overrides = {}) => ({
  output: { reasoning: "I can answer this.", action: "respond", response, ...overrides },
  usage,
});
const use = (capability: string, args: Record<string, unknown> = {}) => ({
  output: {
    reasoning: `I need the ${capability}.`,
    action: "use",
    capability,
    args: { instruction: "Do the thing", ...args },
  },
  usage,
});
const ask = (question: string) => ({
  output: { reasoning: "I am missing something.", action: "ask", question },
  usage,
});

describe("CMO agent loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(brand);
    mocks.findCampaign.mockResolvedValue(null);
    mocks.runAgent.mockResolvedValue({ ok: true, summary: "worker complete" });
    mocks.getOrCreateConversation.mockResolvedValue("conversation_1");
    mocks.loadContext.mockResolvedValue([]);
    mocks.loadPendingClarification.mockResolvedValue(null);
    mocks.loadPendingPlanOffer.mockResolvedValue(false);
    mocks.campaignUpsert.mockResolvedValue({});
    mocks.saveExchange.mockResolvedValue(undefined);
  });

  it("answers directly without using a specialist", async () => {
    mocks.generateText.mockResolvedValue(respond());

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(output.result?.delegations).toEqual([]);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("observes a specialist result before deciding again", async () => {
    mocks.generateText
      .mockResolvedValueOnce(use("brand-analyst", { url: "https://example.com" }))
      .mockResolvedValueOnce(respond());
    mocks.runAgent.mockResolvedValue({ ok: true, summary: "kernel rebuilt" });

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
    // The second call must contain what the first step produced.
    const secondPrompt = mocks.generateText.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain("kernel rebuilt");
    expect(secondPrompt).toContain("brand-analyst");
  });

  it("shows a failure to the model so it can change course", async () => {
    mocks.runAgent.mockResolvedValue({
      ok: false,
      summary: "crawl blocked",
      error: { code: "UNKNOWN", message: "crawl blocked", retryable: false },
    });
    mocks.generateText
      .mockResolvedValueOnce(use("brand-analyst"))
      .mockResolvedValueOnce(ask("What is your website address?"));

    const output = await cmoAgent.run(input);

    const secondPrompt = mocks.generateText.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain("failed");
    expect(output.result?.intent).toBe("clarify");
    expect(output.result?.response.nextStep).toContain("website address");
  });

  it("refuses the strategist until a plan is approved, and says why", async () => {
    mocks.generateText
      .mockResolvedValueOnce(use("strategist"))
      .mockResolvedValueOnce(respond());

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    // The refusal is fed back rather than silently dropping the call.
    const secondPrompt = mocks.generateText.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain("denied");
    expect(secondPrompt).toContain("not asked for or agreed to a plan");
  });

  it("allows the strategist once the user asks for a plan", async () => {
    mocks.generateText
      .mockResolvedValueOnce(use("strategist", { channel: "instagram" }))
      .mockResolvedValueOnce(respond());
    mocks.runAgent.mockResolvedValue({ ok: false, summary: "analyst unavailable" });

    await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "create a campaign plan for the intake" },
    });

    expect(mocks.runAgent).toHaveBeenCalled();
  });

  it("refuses an unknown capability instead of crashing", async () => {
    mocks.generateText
      .mockResolvedValueOnce(use("astrologer"))
      .mockResolvedValueOnce(respond());

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.generateText.mock.calls[1][0].prompt as string)
      .toContain("no capability called");
  });

  it("stops calling specialists once the step budget is spent", async () => {
    mocks.generateText.mockResolvedValue(use("brand-analyst"));
    mocks.runAgent.mockResolvedValue({ ok: true, summary: "kernel rebuilt" });

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    // The budget caps real work no matter how many times the model asks.
    expect(mocks.runAgent.mock.calls.length).toBeLessThanOrEqual(4);
    expect(mocks.generateText.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("returns a typed input error when the brand does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const output = await cmoAgent.run(input);
    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("INPUT_ERROR");
  });

  it("recovers from malformed model output instead of failing the turn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateText.mockResolvedValue({ output: { bad: true }, usage });

    const output = await cmoAgent.run(input);

    // A decision that will not parse is fed back and retried, and the turn
    // still ends with something to show rather than an exception.
    expect(output.ok).toBe(true);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.generateText.mock.calls.length).toBeGreaterThan(1);
    const laterPrompt = mocks.generateText.mock.calls[1][0].prompt as string;
    expect(laterPrompt).toContain("did not match the required shape");
  });

  it("tolerates the blank fields structured output adds to a decision", async () => {
    // Gemini fills every declared field, so a "use" arrives with an empty
    // question and a hollow response object alongside it.
    mocks.generateText
      .mockResolvedValueOnce({
        output: {
          reasoning: "Rebuild the kernel.",
          action: "use",
          capability: "brand-analyst",
          question: "",
          response: { title: "", executiveSummary: "", nextStep: "" },
        },
        usage,
      })
      .mockResolvedValueOnce(respond());
    mocks.runAgent.mockResolvedValue({ ok: true, summary: "kernel rebuilt" });

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
  });

  it("keeps a simple greeting conversational", async () => {
    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "hello" },
    });
    expect(output.ok).toBe(true);
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(output.result?.intent).toBe("chat");
  });

  it("classifies plan consent and outright plan requests", () => {
    expect(explicitPlanRequest("create a campaign plan for merdeka")).toBe(true);
    expect(explicitPlanRequest("is this a good idea?")).toBe(false);
    expect(agreesToPlanOffer("yes please")).toBe(true);
    expect(agreesToPlanOffer("not yet, what about cost?")).toBe(false);
  });

  it("drops product names the confirmed catalogue does not contain", () => {
    const kernel = {
      productCatalogues: [{ products: [{ name: "Playgroup Programme", sku: "PG-1" }] }],
    };
    expect(catalogueBackedSelectors(["Merdeka Intake"], kernel)).toEqual([]);
    expect(catalogueBackedSelectors(["Playgroup Programme"], kernel)).toEqual(["Playgroup Programme"]);
  });

  it("does not turn inferred offer language into hard catalogue selectors", () => {
    expect(explicitProductSelectors("Promote the bundle", ["Starter Bundle"])).toEqual([]);
    expect(explicitProductSelectors("Promote the Starter Bundle", ["Starter Bundle"]))
      .toEqual(["Starter Bundle"]);
  });
});
