import { generateText, Output } from "ai";
import { MODELS, model } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import { getDb } from "@/lib/db";
import { buildFallbackStrategy } from "./fallback";
import { buildStrategistPrompt, buildStrategistSystemPrompt, evidenceIds } from "./prompt";
import { buildExecutionPlan } from "./plan";
import {
  StrategistModelResultSchema,
  StrategistResultSchema,
  type StrategistPayload,
  type StrategistResult,
} from "./schema";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function catalogueProducts(kernelValue: unknown): unknown[] {
  const kernel = record(kernelValue);
  const catalogues = Array.isArray(kernel.productCatalogues) ? kernel.productCatalogues : [];
  return catalogues.flatMap((catalogue) => {
    const products = record(catalogue).products;
    return Array.isArray(products) ? products : [];
  });
}

function productName(value: unknown): string {
  const product = record(value);
  return typeof product.name === "string" ? product.name : "";
}

function selectProducts(products: unknown[], selectors: string[]): unknown[] {
  if (selectors.length === 0) return products.slice(0, 50);
  const terms = selectors.map((selector) => selector.toLowerCase());
  return products.filter((value) => {
    const product = record(value);
    const searchable = [product.name, product.sku, product.category]
      .filter((item): item is string => typeof item === "string")
      .join(" ")
      .toLowerCase();
    return terms.some((term) => searchable.includes(term));
  }).slice(0, 50);
}

export const strategistAgent: Agent<StrategistPayload, StrategistResult> = {
  id: "strategist",
  model: MODELS.cmo,

  async run(input) {
    const brand = await getDb().brand.findUnique({
      where: { id: input.brandId },
      include: {
        directives: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
    });
    if (!brand) {
      return agentFailure({
        agentId: "strategist",
        traceId: input.traceId,
        model: MODELS.cmo,
        summary: "Brand memory not found",
        error: {
          code: "INPUT_ERROR",
          message: "Build Brand Memory before requesting a strategy.",
          retryable: false,
        },
      });
    }

    const availableProducts = catalogueProducts(brand.kernel);
    const products = selectProducts(availableProducts, input.payload.productSelectors);
    if (input.payload.productSelectors.length > 0 && products.length === 0) {
      return agentFailure({
        agentId: "strategist",
        traceId: input.traceId,
        model: MODELS.cmo,
        summary: "Requested products not found",
        error: {
          code: "INPUT_ERROR",
          message: "None of the requested products were found in the confirmed catalogue.",
          detail: `Requested: ${input.payload.productSelectors.join(", ")}`,
          retryable: false,
        },
      });
    }

    const memory = {
      name: brand.name,
      updatedAt: brand.updatedAt.toISOString(),
      kernel: brand.kernel,
      voice: brand.voice,
      products,
      activeDirective: input.payload.cmoDirective ?? brand.directives[0]?.statement,
    };
    let inputTokens = 0;
    let outputTokens = 0;
    let usedFallback = false;
    let strategy;
    try {
      const call = await generateText({
        model: model(MODELS.cmo),
        system: buildStrategistSystemPrompt(memory),
        prompt: buildStrategistPrompt({ payload: input.payload, memory }),
        output: Output.object({ schema: StrategistModelResultSchema }),
        maxOutputTokens: 1_800,
        maxRetries: 1,
        // Current public evidence gets the larger share of the CMO's fixed
        // interactive budget. A deterministic evidence-aware plan takes over
        // if structured strategy generation cannot finish promptly.
        timeout: { totalMs: 3_000 },
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      });
      strategy = StrategistModelResultSchema.parse(call.output);
      inputTokens = call.usage.inputTokens ?? 0;
      outputTokens = call.usage.outputTokens ?? 0;
    } catch {
      usedFallback = true;
      strategy = buildFallbackStrategy({
        objective: input.payload.objective,
        brandName: brand.name,
        kernel: brand.kernel,
        channels: input.payload.channels,
        productNames: products.map(productName).filter(Boolean),
        intelligence: input.payload.intelligence,
      });
    }
    const validEvidence = new Set(evidenceIds(input.payload.intelligence));
    const validProducts = new Set(products.map(productName).filter(Boolean));
    const validExperimentIds = new Set(strategy.experiments.map((experiment) => experiment.id));
    const recommendedExperimentId = validExperimentIds.has(strategy.recommendedExperimentId)
      ? strategy.recommendedExperimentId
      : strategy.experiments[0].id;
    const createdAt = new Date().toISOString();
    const sprintDays = input.payload.horizon === "quarter" ? 30 : 14;
    const nextReviewAt = new Date(Date.parse(createdAt) + sprintDays * 24 * 60 * 60 * 1_000).toISOString();
    const executionPlan = buildExecutionPlan({
      objective: input.payload.objective,
      strategy: { ...strategy, recommendedExperimentId },
      intelligence: input.payload.intelligence,
      createdAt,
    });
    const result = StrategistResultSchema.parse({
      ...strategy,
      selectedProducts: strategy.selectedProducts.filter((name) => validProducts.has(name)),
      contentPillars: strategy.contentPillars.map((pillar) => ({
        ...pillar,
        evidenceIds: pillar.evidenceIds.filter((id) => validEvidence.has(id)),
      })),
      experiments: strategy.experiments.map((experiment) => ({
        ...experiment,
        productNames: experiment.productNames.filter((name) => validProducts.has(name)),
        evidenceIds: experiment.evidenceIds.filter((id) => validEvidence.has(id)),
      })),
      recommendedExperimentId,
      strategyId: `strategy-${input.traceId}`,
      createdAt,
      intelligenceSnapshotId: input.payload.intelligence.snapshotId,
      brandMemoryUpdatedAt: memory.updatedAt,
      horizon: input.payload.horizon,
      objective: input.payload.objective,
      nextReviewAt,
      executionPlan,
    });

    return agentSuccess({
      agentId: "strategist",
      traceId: input.traceId,
      model: MODELS.cmo,
      result,
      summary: `${usedFallback ? "Fallback plan" : "Strategy ready"} · ${result.experiments.length} options · ${result.executionPlan.totalAssets} assets`,
      inputTokens,
      outputTokens,
    });
  },
};
