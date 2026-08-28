import { getDb } from "@/lib/db";
import {
  parseMetricImport,
  serializableMetricImport,
} from "@/lib/agents/analyst/metrics-import";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const brandId = String(formData.get("brandId") ?? "").trim();
    const action = String(formData.get("action") ?? "preview");
    const mode = String(formData.get("mode") ?? "replace");
    const file = formData.get("file");

    if (!brandId) return jsonError("brandId is required.", 400);
    if (action !== "preview" && action !== "import") {
      return jsonError("action must be preview or import.", 400);
    }
    if (mode !== "replace" && mode !== "append") {
      return jsonError("mode must be replace or append.", 400);
    }
    if (!(file instanceof File)) return jsonError("Choose a CSV or XLSX file.", 400);

    const db = getDb();
    const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!brand) return jsonError("The selected brand workspace does not exist.", 404);

    const parsed = await parseMetricImport(file.name, new Uint8Array(await file.arrayBuffer()));
    const preview = serializableMetricImport(parsed);
    if (parsed.errors.length) {
      return Response.json({ ok: false, ...preview }, { status: 422 });
    }
    if (action === "preview") {
      return Response.json({ ok: true, action, ...preview });
    }

    const data = parsed.rows.map((row) => ({
      brandId,
      date: row.date,
      channel: row.channel,
      format: row.format,
      pillar: row.pillar,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      conversions: row.conversions,
    }));
    let replaced = 0;
    let imported = 0;
    if (mode === "replace") {
      const from = new Date(parsed.summary.from!);
      const to = new Date(parsed.summary.to!);
      const [deleted, created] = await db.$transaction([
        db.metric.deleteMany({
          where: {
            brandId,
            channel: { in: parsed.summary.channels },
            date: { gte: from, lte: to },
          },
        }),
        db.metric.createMany({ data }),
      ]);
      replaced = deleted.count;
      imported = created.count;
    } else {
      imported = (await db.metric.createMany({ data })).count;
    }

    return Response.json({
      ok: true,
      action,
      mode,
      imported,
      replaced,
      ...preview,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Metrics import failed.",
      500,
    );
  }
}
