import "server-only";

import { z } from "zod";
import {
  BrandKernelSchema,
  BrandVoiceSchema,
  ConflictSchema,
  ConfirmedInformationSchema,
  EvidenceItemSchema,
  InformationRequestSchema,
  SourceReportSchema,
  VisualIdentitySchema,
} from "@/lib/agents/brand-analyst/schema";
import { getDb } from "@/lib/db";

const ProvenanceSchema = z.object({
  traceId: z.string().optional(),
  extractedAt: z.string().optional(),
  crawledUrls: z.array(z.string()).default([]),
  sources: z.array(SourceReportSchema).default([]),
  evidence: z.array(EvidenceItemSchema).default([]),
  conflicts: z.array(ConflictSchema).default([]),
  missingInformation: z.array(z.string()).default([]),
  informationRequests: z.array(InformationRequestSchema).default([]),
  confirmedInformation: z.array(ConfirmedInformationSchema).default([]),
}).partial();

const StoredKernelSchema = BrandKernelSchema.partial().extend({
  visualIdentity: VisualIdentitySchema.partial().optional(),
  provenance: ProvenanceSchema.optional(),
});

const StoredVoiceSchema = BrandVoiceSchema.partial();

export async function getActiveBrandMemory() {
  const brand = await getDb().brand.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      url: true,
      kernel: true,
      voice: true,
      updatedAt: true,
    },
  });

  if (!brand) return null;

  const kernel = StoredKernelSchema.safeParse(brand.kernel);
  const voice = StoredVoiceSchema.safeParse(brand.voice);

  return {
    id: brand.id,
    name: brand.name,
    url: brand.url,
    updatedAt: brand.updatedAt.toISOString(),
    kernel: kernel.success ? kernel.data : {},
    voice: voice.success ? voice.data : {},
  };
}

export type ActiveBrandMemory = NonNullable<
  Awaited<ReturnType<typeof getActiveBrandMemory>>
>;
