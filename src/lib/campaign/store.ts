import { buildExecutionPlan, type PlanEvidence } from "@/lib/agents/strategist/plan";
import {
  StrategistResultSchema,
  StrategyExecutionPlanSchema,
  type StrategistResult,
  type StrategyExecutionPlan,
} from "@/lib/agents/strategist/schema";
import { getDb } from "@/lib/db";

export interface StoredCampaign {
  id: string;
  brandId: string;
  strategyId: string;
  objective: string;
  selectedOptionId: string;
  status: "proposed" | "selected";
  strategy: StrategistResult;
  executionPlan: StrategyExecutionPlan;
  createdAt: string;
  updatedAt: string;
}

function parse(row: {
  id: string;
  brandId: string;
  strategyId: string;
  objective: string;
  selectedOptionId: string;
  status: string;
  strategy: unknown;
  executionPlan: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StoredCampaign | null {
  const strategy = StrategistResultSchema.safeParse(row.strategy);
  const executionPlan = StrategyExecutionPlanSchema.safeParse(row.executionPlan);
  if (!strategy.success || !executionPlan.success) return null;
  return {
    id: row.id,
    brandId: row.brandId,
    strategyId: row.strategyId,
    objective: row.objective,
    selectedOptionId: row.selectedOptionId,
    status: row.status === "selected" ? "selected" : "proposed",
    strategy: strategy.data,
    executionPlan: executionPlan.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Records a freshly built strategy so the plan survives the chat message it
 * arrived in. Stored against strategyId so a re-run of the same strategy
 * updates in place rather than accumulating duplicates.
 */
export async function saveProposedCampaign(input: {
  brandId: string;
  conversationId?: string;
  strategy: StrategistResult;
}): Promise<void> {
  const shared = {
    brandId: input.brandId,
    conversationId: input.conversationId ?? null,
    objective: input.strategy.objective,
    selectedOptionId: input.strategy.recommendedExperimentId,
    status: "proposed",
    strategy: input.strategy as unknown as object,
    executionPlan: input.strategy.executionPlan as unknown as object,
  };
  await getDb().campaign.upsert({
    where: { strategyId: input.strategy.strategyId },
    create: { strategyId: input.strategy.strategyId, ...shared },
    update: shared,
  });
}

/**
 * Applies the user's choice. The Strategist only ever schedules its own
 * recommended option, so choosing a different one rebuilds the schedule,
 * dates, cadence and measurement around that option's channel and duration.
 */
export async function selectCampaignOption(input: {
  brandId: string;
  strategyId: string;
  optionId: string;
}): Promise<StoredCampaign | null> {
  const row = await getDb().campaign.findUnique({
    where: { strategyId: input.strategyId },
  });
  if (!row || row.brandId !== input.brandId) return null;
  const current = parse(row);
  if (!current) return null;

  const chosen = current.strategy.experiments.find(
    (experiment) => experiment.id === input.optionId,
  );
  if (!chosen) return null;

  // Which evidence backed the plan cannot change by picking a different
  // option, so it is recovered from the stored basis instead of retaining
  // the whole Analyst snapshot.
  const evidence: PlanEvidence = {
    hasOwnedPerformance:
      current.executionPlan.planningBasis === "owned-and-market-evidence",
    hasMarketEvidence:
      current.executionPlan.planningBasis !== "brand-led-assumption",
  };
  const executionPlan = buildExecutionPlan({
    objective: current.strategy.objective,
    strategy: { ...current.strategy, recommendedExperimentId: chosen.id },
    evidence,
    createdAt: current.strategy.createdAt,
  });

  const updated = await getDb().campaign.update({
    where: { strategyId: input.strategyId },
    data: {
      selectedOptionId: chosen.id,
      status: "selected",
      executionPlan: executionPlan as unknown as object,
    },
  });
  return parse(updated);
}

/** One campaign by its strategy id, for writing a specific scheduled post. */
export async function loadCampaignByStrategyId(
  strategyId: string,
): Promise<StoredCampaign | null> {
  const row = await getDb().campaign.findUnique({ where: { strategyId } });
  return row ? parse(row) : null;
}

/** The most recent campaign for a brand, preferring one the user has chosen. */
export async function loadLatestCampaign(
  brandId: string,
): Promise<StoredCampaign | null> {
  const rows = await getDb().campaign.findMany({
    where: { brandId },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  const parsed = rows.map(parse).filter((row): row is StoredCampaign => row !== null);
  return parsed.find((row) => row.status === "selected") ?? parsed[0] ?? null;
}
