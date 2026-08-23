import { MODELS } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import type { Agent, AgentInput } from "@/lib/agents/types";
import { extractBrandProfile, type ExtractionOutput } from "./extract";
import { persistBrandProfile } from "./persist";
import { reportBrandAnalystProgress } from "./progress";
import {
  BrandAnalystResultSchema,
  type BrandAnalystPayload,
  type BrandAnalystResult,
} from "./schema";
import { prepareBrandSources, type PreparedSources } from "./sources";

export interface BrandAnalystDependencies {
  prepareSources(payload: BrandAnalystPayload): Promise<PreparedSources>;
  extract(
    companyName: string | undefined,
    sources: PreparedSources["sources"],
    traceId: string,
  ): Promise<ExtractionOutput>;
  persist(
    brandId: string,
    payload: BrandAnalystPayload,
    result: BrandAnalystResult,
    traceId: string,
  ): Promise<void>;
}

const defaultDependencies: BrandAnalystDependencies = {
  prepareSources: prepareBrandSources,
  extract: extractBrandProfile,
  persist: persistBrandProfile,
};

export function createBrandAnalystAgent(
  dependencyOverrides: Partial<BrandAnalystDependencies> = {},
): Agent<BrandAnalystPayload, BrandAnalystResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };

  return {
    id: "brand-analyst",
    model: MODELS.brandAnalyst,

    async run(input: AgentInput<BrandAnalystPayload>) {
      reportBrandAnalystProgress(input.traceId, {
        phase: "ingesting",
        text: `Validating ${input.payload.sources.length || 1} brand sources`,
      });

      let prepared: PreparedSources;
      try {
        prepared = await dependencies.prepareSources(input.payload);
      } catch (error) {
        return agentFailure({
          agentId: "brand-analyst",
          traceId: input.traceId,
          model: MODELS.brandAnalyst,
          summary: "Source ingestion failed",
          error: {
            code: "INPUT_ERROR",
            message: "The supplied brand sources could not be prepared.",
            detail: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        });
      }

      if (prepared.sources.length === 0) {
        return agentFailure({
          agentId: "brand-analyst",
          traceId: input.traceId,
          model: MODELS.brandAnalyst,
          summary: "No usable brand sources",
          error: {
            code: "INPUT_ERROR",
            message: "None of the supplied sources contained usable brand evidence.",
            detail: prepared.reports
              .flatMap((source) => source.warnings)
              .join(" ")
              .slice(0, 1_000),
            retryable: false,
          },
        });
      }

      const logoOnly = prepared.sources.every(
        (source) =>
          source.kind === "image" && source.label.toLowerCase().includes("logo"),
      );
      if (logoOnly) {
        return agentFailure({
          agentId: "brand-analyst",
          traceId: input.traceId,
          model: MODELS.brandAnalyst,
          summary: "More brand evidence needed",
          error: {
            code: "INPUT_ERROR",
            message:
              "A logo can inform visual identity, but it cannot establish the Brand Kernel by itself.",
            detail:
              "Add a website, brand document, approved copy, or structured company context.",
            retryable: false,
          },
        });
      }

      reportBrandAnalystProgress(input.traceId, {
        phase: "ingesting",
        text: `${prepared.sources.length} sources ready for analysis`,
      });

      let extraction: ExtractionOutput;
      try {
        extraction = await dependencies.extract(
          input.payload.companyName,
          prepared.sources,
          input.traceId,
        );
      } catch (error) {
        return agentFailure({
          agentId: "brand-analyst",
          traceId: input.traceId,
          model: MODELS.brandAnalyst,
          summary: "Brand extraction failed",
          error: {
            code: "MODEL_ERROR",
            message: "Gemini could not produce a valid brand profile.",
            detail: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        });
      }

      const result = BrandAnalystResultSchema.parse({
        ...extraction.result,
        crawledUrls: prepared.crawledUrls,
        sources: prepared.reports,
      });

      reportBrandAnalystProgress(input.traceId, {
        phase: "persisting",
        text: "Saving confirmed brand memory to Neon",
      });

      try {
        await dependencies.persist(
          input.brandId,
          input.payload,
          result,
          input.traceId,
        );
      } catch (error) {
        return agentFailure({
          agentId: "brand-analyst",
          traceId: input.traceId,
          model: MODELS.brandAnalyst,
          summary: "Brand save failed",
          error: {
            code: "UNKNOWN",
            message: "The profile was extracted but could not be saved to Neon.",
            detail: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        });
      }

      return agentSuccess({
        agentId: "brand-analyst",
        traceId: input.traceId,
        model: MODELS.brandAnalyst,
        result,
        summary: `Brand profile from ${prepared.sources.length} sources`,
        inputTokens: extraction.inputTokens,
        outputTokens: extraction.outputTokens,
      });
    },
  };
}

export const brandAnalystAgent = createBrandAnalystAgent();
