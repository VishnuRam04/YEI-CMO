import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const sql = neon(process.env.DATABASE_URL);
const existing = await sql.query('SELECT id, name FROM "Brand" LIMIT 1');

if (existing.length > 0) {
  console.log(`Seed skipped: brand "${existing[0].name}" already exists.`);
  process.exit(0);
}

const kernel = {
  positioning:
    "Northwind is the agentic CMO workspace where specialist agents share one brand memory and learn from every result.",
  category: "Agentic marketing operations",
  icps: [
    {
      name: "Lean B2B marketing teams",
      needs: ["More output without losing brand consistency", "Clear strategic direction"],
    },
    {
      name: "Founder-led companies",
      needs: ["A repeatable marketing system", "Evidence-led content"],
    },
  ],
  differentiators: [
    "One shared Brand Kernel",
    "Specialist agents with a common contract",
    "A measurable learning loop",
  ],
  proofPoints: ["Every agent reads the same memory", "Outputs carry real telemetry"],
};

const voice = {
  toneAxes: { direct: 5, practical: 5, confident: 4, playful: 2 },
  do: ["Be specific", "Name the mechanism", "Write like an experienced operator"],
  dont: ["Overclaim", "Use generic AI hype", "Confuse activity with strategy"],
  bannedWords: ["revolutionary", "game-changing", "seamless"],
  exemplars: [
    "More content is not a strategy. A learning loop is.",
    "One brand truth. Specialist agents. Measurable learning.",
    "The next campaign starts from what your market already taught you.",
    "Strategy, copy and analysis should not forget each other between prompts.",
    "Build recognition first. Then make the proof land.",
  ],
};

await sql.query(
  `INSERT INTO "Brand"
    (id, name, url, kernel, voice, "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  [
    "northwind-demo",
    "Northwind Labs",
    "https://example.com",
    JSON.stringify(kernel),
    JSON.stringify(voice),
  ],
);

await sql.query(
  `INSERT INTO "StrategicDirective"
    (id, "brandId", statement, rationale, active, "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  [
    "northwind-demo-directive",
    "northwind-demo",
    "Prioritise qualified conversations over raw content volume.",
    "The product should demonstrate strategic learning, not merely generation speed.",
  ],
);

console.log("Seeded Northwind Labs demo brand.");
