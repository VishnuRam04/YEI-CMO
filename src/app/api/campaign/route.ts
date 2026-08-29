import { z } from "zod";
import { loadLatestCampaign, selectCampaignOption } from "@/lib/campaign/store";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const SelectRequestSchema = z.object({
  brandId: z.string().min(1),
  strategyId: z.string().min(1),
  optionId: z.string().min(1),
});

/** Applies the user's option choice and returns the rebuilt plan. */
export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof SelectRequestSchema>;
  try {
    parsed = SelectRequestSchema.parse(await request.json());
  } catch (error) {
    return Response.json({
      ok: false,
      message: "Request body does not match the campaign selection schema.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }

  try {
    const campaign = await selectCampaignOption(parsed);
    if (!campaign) {
      return Response.json({
        ok: false,
        message: "That campaign option is no longer available.",
      }, { status: 404 });
    }
    return Response.json({ ok: true, campaign });
  } catch (error) {
    return Response.json({
      ok: false,
      message: "The chosen option could not be saved.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}

/** The active campaign for a brand, defaulting to the most recent brand. */
export async function GET(request: Request): Promise<Response> {
  try {
    const requestedBrandId = new URL(request.url).searchParams.get("brandId");
    const brand = requestedBrandId
      ? await getDb().brand.findUnique({
          where: { id: requestedBrandId },
          select: { id: true, name: true },
        })
      : await getDb().brand.findFirst({
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true },
        });
    if (!brand) {
      return Response.json({
        ok: false,
        message: "Onboard a brand before opening the plan.",
      }, { status: 404 });
    }

    return Response.json({
      ok: true,
      brand,
      campaign: await loadLatestCampaign(brand.id),
    });
  } catch (error) {
    return Response.json({
      ok: false,
      message: "The plan could not be loaded.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}
