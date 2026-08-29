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

describe("CMO orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(brand);
    mocks.findCampaign.mockResolvedValue(null);
    mocks.runAgent.mockResolvedValue({ summary: "worker complete" });
    mocks.getOrCreateConversation.mockResolvedValue("conversation_1");
    mocks.loadContext.mockResolvedValue([]);
    mocks.loadPendingClarification.mockResolvedValue(null);
    mocks.loadPendingPlanOffer.mockResolvedValue(false);
    mocks.campaignUpsert.mockResolvedValue({});
    mocks.saveExchange.mockResolvedValue(undefined);
  });

  it("answers directly without calling a worker", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "chat", response, delegations: [] },
      usage,
    });

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(true);
    expect(output.result?.response).toEqual(response);
    expect(output.result?.conversationId).toBe("conversation_1");
    expect(output.result?.presentation).toBe("brief");
    expect(output.result?.reply).not.toContain("Recommendation:");
    expect(output.result?.reply).toContain("Next step:");
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.saveExchange).toHaveBeenCalledOnce();
  });

  it("keeps a simple greeting conversational", async () => {
    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "Hi" },
    });

    expect(output.ok).toBe(true);
    expect(output.result?.presentation).toBe("conversation");
    expect(output.result?.reply).toContain("What marketing outcome");
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.saveExchange).toHaveBeenCalledOnce();
  });

  it("enforces a maximum of three delegation hops in code", async () => {
    const plan = {
      agentId: "copywriter",
      instruction: "Write a launch post",
      url: "",
      channel: "linkedin",
      from: "",
      to: "",
    };
    mocks.generateText
      .mockResolvedValueOnce({
        output: {
          intent: "generate",
          response,
          delegations: [plan, plan, plan, plan],
        },
        usage,
      })
      .mockResolvedValueOnce({
        output: { response },
        usage,
      });

    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "Create four post directions" },
    });

    expect(output.ok).toBe(true);
    expect(output.result?.delegations).toHaveLength(3);
    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
  });

  it("does not turn inferred offer language into hard catalogue selectors", () => {
    expect(explicitProductSelectors(
      "Run a Merdeka campaign to recruit more students",
      ["Preschool Enrolment", "3-Day Free Trial"],
    )).toEqual([]);
    expect(explicitProductSelectors(
      "Build the campaign around our CMO-1 workspace",
      ["CMO-1", "Invented Product"],
    )).toEqual(["CMO-1"]);
  });

  it("routes an explicit pre-flight request to the Campaign Critic", async () => {
    mocks.findCampaign.mockResolvedValue({
      id: "campaign_1",
      brandId: "brand_1",
      name: "Launch campaign",
      updatedAt: new Date("2026-08-28T00:00:00.000Z"),
      definition: {
        id: "campaign_1",
        name: "Launch campaign",
        startDate: "2026-09-01",
        endDate: "2026-09-14",
      },
      assets: [],
      reviews: [],
    });
    const recommendations = [1, 2, 3].map((rank) => ({
      rank,
      action: `Fix ${rank}`,
      rationale: `Reason ${rank}`,
      evidence: [],
      expectedImpact: { low: null, high: null, unit: "not estimated", basis: "No history." },
      effort: "low",
      confidence: "high",
      planItem: null,
    }));
    mocks.runAgent.mockResolvedValue({
      ok: true,
      summary: "Pre-flight · hold · 55/100",
      result: {
        mode: "preflight",
        reviewId: "review_1",
        campaignId: "campaign_1",
        campaignName: "Launch campaign",
        reviewedAt: "2026-08-28T00:00:00.000Z",
        verdict: "hold",
        readinessScore: 55,
        executiveSummary: "Tracking must be fixed before launch.",
        criteria: [
          "alignment", "targeting", "offer", "creative-fit", "message-match", "tracking", "feasibility",
        ].map((key) => ({ key, label: key, score: 55, weight: key === "feasibility" ? 10 : 15, finding: "Needs work.", evidenceIds: [] })),
        issues: [],
        blockingIssues: [],
        recommendations,
      },
    });

    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "Review our latest campaign before launch" },
    });

    expect(output.ok).toBe(true);
    expect(output.result?.intent).toBe("review-campaign");
    expect(output.result?.delegations).toEqual(["campaign-critic"]);
    expect(output.result?.response.title).toContain("Hold campaign");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("runs Analyst intelligence before the Strategist", async () => {
    const intelligence = {
      snapshotId: "intel-trace_1-intel",
      mode: "combined",
      generatedAt: "2026-08-26T00:00:00.000Z",
      dataThrough: "2026-08-26T00:00:00.000Z",
      expiresAt: "2026-08-27T00:00:00.000Z",
      stats: [],
      performanceSignals: [],
      marketSignals: [{
        id: "market-1",
        finding: "Nearby schools mainly promote discounts and facilities.",
        implication: "Showing real classroom outcomes may help the brand stand out.",
        sourceUrls: ["https://example.com/competitor-research"],
        observedAt: "2026-08-26T00:00:00.000Z",
        confidence: 0.8,
      }],
      intelligenceParts: {
        ownedPerformance: {
          status: "missing",
          recordCount: 0,
          summary: "No imported performance records are available.",
        },
        webAdvantageResearch: {
          status: "available",
          sourceCount: 1,
          summary: "One current competitor pattern was found from one public source.",
        },
      },
      connectorStatus: [{
        source: "google-grounded-search",
        status: "active",
        detail: "Current public webpages were checked.",
        checkedAt: "2026-08-26T00:00:00.000Z",
      }],
      patterns: [],
      opportunities: [],
      risks: [],
      missingData: ["Social accounts are not connected."],
      sources: [{
        id: "source-1",
        title: "Competitor research",
        url: "https://example.com/competitor-research",
        publishedAt: null,
        retrievedAt: "2026-08-26T00:00:00.000Z",
      }],
      digest: "No owned metrics were available.",
    };
    const strategy = {
      strategyId: "strategy-trace_1-strategy",
      createdAt: "2026-08-26T00:00:00.000Z",
      intelligenceSnapshotId: intelligence.snapshotId,
      brandMemoryUpdatedAt: "2026-08-26T00:00:00.000Z",
      horizon: "sprint",
      objective: "Build a LinkedIn acquisition strategy",
      nextReviewAt: "2026-09-09T00:00:00.000Z",
      executionPlan: {
        selectedExperimentId: "exp-balanced",
        campaignName: "balanced option",
        startDate: "2026-08-28",
        endDate: "2026-09-10",
        timezone: "Brand local time",
        totalAssets: 6,
        cadence: "6 scheduled assets across 14 days on linkedin.",
        costLevel: "medium",
        planningBasis: "brand-led-assumption",
        schedule: [{
          sequence: 1,
          date: "2026-08-28",
          day: "Fri",
          publishTimeLocal: "08:00",
          channel: "linkedin",
          assetType: "Point-of-view post",
          theme: "Proof",
          action: "Publish a proof-led launch post.",
          purpose: "Introduce the campaign promise.",
          expectedImpact: "Generate the first qualified visits.",
          primaryMetric: "qualified CTR",
        }],
        measurement: {
          primaryMetric: "qualified CTR",
          successThreshold: ">3%",
          stopCondition: "Stop below 1%",
          reviewDate: "2026-09-10",
          timingBasis: "Times are test windows until owned performance data is imported.",
        },
      },
      ideaVerdict: "promising",
      verdictReason: "The idea is sound, but it needs a sharper conversion path.",
      strategicThesis: "Lead with evidence of shared memory.",
      targetAudiences: ["B2B CMOs"],
      selectedProducts: [],
      positioningAngle: "One source of truth",
      offerStrategy: "Invite a workflow review",
      channelRoles: [{ channel: "linkedin", purpose: "Demand creation", cadence: "3 weekly" }],
      contentPillars: [],
      experiments: ["lean", "balanced", "reach"].map((id, index) => ({
        id: `exp-${id}`,
        title: `${id} option`,
        approach: `Option ${index + 1} approach`,
        costLevel: index === 0 ? "low" : index === 1 ? "medium" : "high",
        riskLevel: index < 2 ? "low" : "medium",
        tradeoff: `Option ${index + 1} trade-off`,
        hypothesis: `Option ${index + 1} hypothesis`,
        channel: "linkedin",
        assetType: "post",
        primaryMetric: "qualified CTR",
        successThreshold: ">3%",
        stopCondition: "Stop below 1%",
        durationDays: 14,
        productNames: [],
        evidenceIds: [],
      })),
      recommendedExperimentId: "exp-balanced",
      assumptions: [],
      risks: [],
      reviewTriggers: ["Review after 14 days"],
      informationRequests: [{
        field: "programmes",
        severity: "review",
        reason: "Exact programme names are needed during execution.",
        question: "Which programme names should the campaign quote?",
        affects: ["campaign execution"],
      }],
    };
    mocks.runAgent
      .mockResolvedValueOnce({ ok: true, result: intelligence, summary: "intelligence ready" })
      .mockResolvedValueOnce({ ok: true, result: strategy, summary: "strategy ready" });

    const output = await cmoAgent.run({
      ...input,
      payload: {
        ...input.payload,
        message: "create a campaign plan for merdeka to get more parents to sign their students up",
      },
    });

    expect(output.ok).toBe(true);
    expect(output.result?.delegations).toEqual(["analyst", "strategist"]);
    expect(output.result?.response.verdict).toBe("promising");
    expect(output.result?.response.options).toHaveLength(3);
    expect(output.result?.response.recommendedOptionId).toBe("exp-balanced");
    expect(output.result?.response.executionPlan?.totalAssets).toBe(6);
    expect(output.result?.response.researchEvidence).toMatchObject({
      status: "available",
      summary: "One current competitor pattern was found from one public source.",
      report: "No owned metrics were available.",
    });
    expect(output.result?.response.researchEvidence?.findings[0].businessMeaning)
      .toContain("stand out");
    expect(output.result?.response.researchEvidence?.sources[0].title)
      .toBe("Competitor research");
    expect(output.result?.response.recommendation).toBe("");
    expect(output.result?.response.clarification).toBeUndefined();
    expect(output.result?.response.nextStep).toContain("Pick the option");
    expect(mocks.runAgent).toHaveBeenCalledTimes(2);
    expect(mocks.runAgent.mock.calls[0][1].payload.mode).toBe("combined");
    expect(mocks.runAgent.mock.calls[0][1].payload.productNames).toEqual([]);
    expect(mocks.runAgent.mock.calls[1][1].payload.intelligence).toEqual(intelligence);
    expect(mocks.runAgent.mock.calls[1][1].payload.productSelectors).toEqual([]);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("talks an idea through instead of jumping to a plan", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "strategize",
        response: {
          title: "Worth doing, with one change",
          executiveSummary: "A Merdeka intake is good timing, but the offer needs to be clearer.",
          keyPoints: ["Parents decide on trust, not discounts."],
          options: [],
          recommendation: "",
          planOffer: false,
          nextStep: "Placeholder.",
        },
        delegations: [{
          agentId: "strategist",
          instruction: "Build a Merdeka campaign",
          url: "",
          channel: "none",
          from: "",
          to: "",
          products: [],
          topics: [],
          horizon: "sprint",
        }],
      },
      usage,
    });

    const output = await cmoAgent.run({
      ...input,
      payload: {
        ...input.payload,
        message: "im thinking of opening a new intake for merdeka, is this a good idea?",
      },
    });

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(output.result?.delegations).toEqual([]);
    expect(output.result?.response.planOffer).toBe(true);
    expect(output.result?.response.options).toEqual([]);
    expect(output.result?.response.nextStep).toContain("build the full plan");
  });

  it("builds the plan once the user agrees to the offer", async () => {
    mocks.loadPendingPlanOffer.mockResolvedValue(true);
    mocks.runAgent.mockResolvedValue({ ok: false, summary: "analyst unavailable" });

    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "yes please" },
    });

    expect(output.ok).toBe(true);
    // The gate opened, so the Strategist pipeline ran rather than being dropped.
    expect(mocks.runAgent).toHaveBeenCalled();
  });

  it("classifies plan consent and outright plan requests", () => {
    expect(explicitPlanRequest("create a campaign plan for merdeka")).toBe(true);
    expect(explicitPlanRequest("build me a plan")).toBe(true);
    expect(explicitPlanRequest("is this a good idea?")).toBe(false);
    expect(explicitPlanRequest("how do i get more parents to sign up")).toBe(false);
    expect(agreesToPlanOffer("yes please")).toBe(true);
    expect(agreesToPlanOffer("go ahead")).toBe(true);
    expect(agreesToPlanOffer("not yet, what about cost?")).toBe(false);
  });

  it("drops product names the confirmed catalogue does not contain", () => {
    const kernel = {
      productCatalogues: [{ products: [{ name: "Playgroup Programme", sku: "PG-1" }] }],
    };
    expect(catalogueBackedSelectors(["Merdeka Intake", "3-Day Free Trial"], kernel)).toEqual([]);
    expect(catalogueBackedSelectors(["Playgroup Programme"], kernel)).toEqual(["Playgroup Programme"]);
    expect(catalogueBackedSelectors(["Playgroup Programme"], {})).toEqual([]);
  });

  it("returns a typed input error when the brand does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("INPUT_ERROR");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("normalises malformed model output as a validation error", async () => {
    mocks.generateText.mockResolvedValue({ output: { bad: true }, usage });

    const output = await cmoAgent.run(input);

    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("VALIDATION_ERROR");
    expect(output.error?.retryable).toBe(false);
  });

  it("turns a Brand Analyst information request into a pending CMO question", async () => {
    const plan = {
      agentId: "brand-analyst",
      instruction: "Refresh the brand memory",
      url: "https://example.com",
      channel: "none",
      from: "",
      to: "",
    };
    mocks.generateText
      .mockResolvedValueOnce({
        output: { intent: "extract", response, delegations: [plan] },
        usage,
      })
      .mockResolvedValueOnce({ output: { response }, usage });
    mocks.runAgent.mockResolvedValue({
      ok: true,
      summary: "Brand profile refreshed",
      result: {
        missingInformation: ["Pricing posture"],
        conflicts: [],
        informationRequests: [{
          id: "request-1-kernel-pricingposture",
          field: "kernel.pricingPosture",
          severity: "review",
          resolution: "ask-user",
          reason: "No authoritative pricing position was found.",
          affects: ["price-objection copy"],
          canResearch: false,
          question: "How should customers understand your pricing position?",
          options: ["Value-led", "Premium value"],
        }],
      },
    });

    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "Refresh our brand memory" },
    });

    expect(output.ok).toBe(true);
    expect(output.result?.response.clarification).toMatchObject({
      id: "request-1-kernel-pricingposture",
      field: "kernel.pricingPosture",
      resumeInstruction: "Refresh our brand memory",
    });
    expect(output.result?.response.nextStep).toContain("pricing position");
    expect(mocks.saveExchange.mock.calls[0][0].response.clarification).toBeTruthy();
  });

  it("sends a clarification answer through the Brand Analyst and resumes the task", async () => {
    mocks.loadPendingClarification.mockResolvedValue({
      id: "request-1-kernel-pricingposture",
      field: "kernel.pricingPosture",
      severity: "review",
      resolution: "ask-user",
      reason: "Pricing was not established.",
      question: "How should customers understand your pricing position?",
      options: ["Value-led", "Premium value"],
      affects: ["price-objection copy"],
      resumeInstruction: "Write the launch page",
    });
    mocks.runAgent.mockResolvedValue({
      ok: true,
      summary: "Confirmed kernel.pricingPosture",
      result: null,
      error: null,
    });
    mocks.generateText
      .mockResolvedValueOnce({
        output: { intent: "generate", response, delegations: [] },
        usage,
      })
      .mockResolvedValueOnce({ output: { response }, usage });

    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "Premium value" },
    });

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          clarification: expect.objectContaining({
            field: "kernel.pricingPosture",
            answer: "Premium value",
          }),
        }),
      }),
    );
    expect(mocks.generateText.mock.calls[0][0].prompt).toContain(
      "Resume this original request: Write the launch page",
    );
    expect(output.result?.delegations).toContain("brand-analyst");
  });

  it("keeps a clarification pending when the user asks why it matters", async () => {
    const pending = {
      id: "request-1-kernel-pricingposture",
      field: "kernel.pricingPosture",
      severity: "review" as const,
      resolution: "ask-user" as const,
      reason: "Pricing affects offer messaging.",
      question: "How should customers understand your pricing position?",
      options: ["Value-led", "Premium value"],
      affects: ["price-objection copy"],
      resumeInstruction: "Write the launch page",
    };
    mocks.loadPendingClarification.mockResolvedValue(pending);
    mocks.generateText.mockResolvedValue({
      output: { intent: "clarify", response, delegations: [] },
      usage,
    });

    const output = await cmoAgent.run({
      ...input,
      payload: { ...input.payload, message: "Why do you need this?" },
    });

    expect(output.ok).toBe(true);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(output.result?.response.clarification).toEqual(pending);
    expect(output.result?.response.nextStep).toContain("pricing position");
  });
});
