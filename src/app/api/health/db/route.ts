import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  try {
    await getDb().$queryRaw`SELECT 1`;
    return Response.json({
      ok: true,
      database: "neon-postgres",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: "neon-postgres",
        message:
          error instanceof Error ? error.message : "Database connection failed.",
      },
      { status: 503 },
    );
  }
}
