import { getDb } from "@/lib/db";
import {
  BrandAnalystResultSchema,
  BrandKernelCoreSchema,
  BrandVoiceSchema,
  ConflictSchema,
  ConfirmedInformationSchema,
  EvidenceItemSchema,
  HttpUrlSchema,
  InformationRequestSchema,
  ProductCatalogueSchema,
  SourceReportSchema,
  VisualIdentitySchema,
  type BrandAnalystPayload,
  type BrandAnalystResult,
} from "./schema";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function pricingPosition(answer: string) {
  const value = answer.toLowerCase();
  if (/luxury/.test(value)) return "luxury" as const;
  if (/premium/.test(value)) return "premium" as const;
  if (/freemium|free tier/.test(value)) return "freemium" as const;
  if (/budget|afford|low[- ]cost/.test(value)) return "budget" as const;
  if (/mid[- ]market/.test(value)) return "mid-market" as const;
  if (/mixed|varies|multiple/.test(value)) return "mixed" as const;
  if (/value/.test(value)) return "value" as const;
  return "unknown" as const;
}

export function applyConfirmedField(
  kernel: ReturnType<typeof BrandKernelCoreSchema.parse>,
  field: string,
  answer: string,
): ReturnType<typeof BrandKernelCoreSchema.parse> {
  if (field === "kernel.positioning" || field === "positioning") {
    return { ...kernel, positioning: answer };
  }
  if (field === "kernel.category" || field === "category") {
    return { ...kernel, category: answer };
  }
  if (field === "kernel.pricingPosture") {
    return {
      ...kernel,
      pricingPosture: {
        position: pricingPosition(answer),
        summary: answer,
        signals: [
          ...(kernel.pricingPosture?.signals ?? []).filter((signal) =>
            !signal.startsWith("User-confirmed:"),
          ),
          `User-confirmed: ${answer}`.slice(0, 500),
        ],
        priceObjectionGuidance: kernel.pricingPosture?.priceObjectionGuidance,
      },
    };
  }
  if (field === "kernel.founderStory") {
    return {
      ...kernel,
      founderStory: {
        founders: kernel.founderStory?.founders ?? [],
        foundingYear: kernel.founderStory?.foundingYear,
        originSummary: answer,
        foundingMotivation: kernel.founderStory?.foundingMotivation,
        milestones: kernel.founderStory?.milestones ?? [],
      },
    };
  }
  if (field === "kernel.regulatedClaims") {
    const lower = answer.toLowerCase();
    const notRegulated = /^(no\b|not regulated)/.test(lower);
    const unsure = /unsure|uncertain|don['’]?t know/.test(lower);
    return {
      ...kernel,
      regulatedClaims: {
        status: notRegulated
          ? "not-regulated"
          : unsure
            ? "potentially-regulated"
            : "regulated",
        domains: kernel.regulatedClaims?.domains ?? [],
        needsClaimsReview: !notRegulated,
        rationale: answer,
        substantiationRequirements:
          kernel.regulatedClaims?.substantiationRequirements ?? [],
      },
    };
  }
  return kernel;
}

export async function buildConfirmedBrandProfile(
  brandId: string,
  payload: BrandAnalystPayload,
): Promise<BrandAnalystResult> {
  const clarification = payload.clarification;
  if (!clarification) throw new Error("A clarification is required.");

  const brand = await getDb().brand.findUnique({
    where: { id: brandId },
    select: { name: true, kernel: true, voice: true },
  });
  if (!brand) throw new Error("Brand memory was not found.");

  const storedKernel = record(brand.kernel);
  const provenance = record(storedKernel.provenance);
  const baseKernel = BrandKernelCoreSchema.parse(storedKernel);
  const kernel = applyConfirmedField(
    baseKernel,
    clarification.field,
    clarification.answer,
  );
  const sourceId = `confirm-${clarification.requestId}`.slice(0, 64);
  const confirmedAt = new Date().toISOString();
  const priorConfirmed = ConfirmedInformationSchema.array().safeParse(
    provenance.confirmedInformation,
  );
  const confirmedInformation = [
    ...(priorConfirmed.success ? priorConfirmed.data : []).filter(
      (item) => item.requestId !== clarification.requestId,
    ),
    {
      requestId: clarification.requestId,
      field: clarification.field,
      question: clarification.question,
      value: clarification.answer,
      sourceId,
      confirmedAt,
      conversationId: clarification.conversationId,
    },
  ].slice(-100);
  const priorSources = SourceReportSchema.array().safeParse(provenance.sources);
  const sources = [
    ...(priorSources.success ? priorSources.data : []).filter(
      (source) => source.id !== sourceId,
    ),
    {
      id: sourceId,
      kind: "text" as const,
      label: "user-confirmed-clarification",
      title: `CMO clarification: ${clarification.field}`.slice(0, 300),
      status: "processed" as const,
      warnings: [],
    },
  ];
  const priorEvidence = EvidenceItemSchema.array().safeParse(provenance.evidence);
  const priorConflicts = ConflictSchema.array().safeParse(provenance.conflicts);
  const priorRequests = InformationRequestSchema.array().safeParse(
    provenance.informationRequests,
  );
  const catalogues = ProductCatalogueSchema.array().safeParse(storedKernel.productCatalogues);
  const visualIdentity = VisualIdentitySchema.parse(storedKernel.visualIdentity ?? {});
  const voice = BrandVoiceSchema.parse(brand.voice);
  const crawledUrls = HttpUrlSchema.array().safeParse(provenance.crawledUrls);
  const missingInformation = stringArray(provenance.missingInformation).filter((item) => {
    const keyword = clarification.field.split(".").at(-1)?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? "";
    return keyword && !item.toLowerCase().includes(keyword.toLowerCase());
  });

  return BrandAnalystResultSchema.parse({
    brandName: brand.name,
    kernel,
    voice,
    visualIdentity,
    evidence: [
      ...(priorEvidence.success ? priorEvidence.data : []).filter(
        (item) => !(item.field === clarification.field && item.sourceId === sourceId),
      ),
      {
        field: clarification.field,
        sourceId,
        excerptOrObservation: clarification.answer.slice(0, 600),
        location: "CMO conversation",
        confidence: 1,
      },
    ],
    conflicts: (priorConflicts.success ? priorConflicts.data : []).filter(
      (conflict) => conflict.field !== clarification.field,
    ),
    missingInformation,
    crawledUrls: crawledUrls.success ? crawledUrls.data : [],
    sources,
    productCatalogues: catalogues.success ? catalogues.data : [],
    informationRequests: (priorRequests.success ? priorRequests.data : []).filter(
      (request) => request.id !== clarification.requestId && request.field !== clarification.field,
    ),
    confirmedInformation,
  });
}
