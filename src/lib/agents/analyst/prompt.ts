export interface DigestMetric {
  label: string;
  value: number;
  sampleSize: number;
}

export function buildSystemPrompt(brandName: string): string {
  return `You are the Performance Analyst for ${brandName}.

ANALYSIS STANDARD
Use only supplied aggregates. Cite exact figures. Findings below n=10 are directional and must be hedged explicitly.

OUTPUT RULES
- Prefer factual, evidence-backed statements over generic claims.
- Never claim a finding is strong when sample size is below 10.
- Frame low-sample findings as directional and uncertain.
- Name the primary win to repeat and the one thing to stop, backed by the data.`;
}

export function buildUserPrompt(metrics: DigestMetric[]): string {
  return `AGGREGATED METRICS
<metrics>${JSON.stringify(metrics, null, 2)}</metrics>

Write a concise Friday digest using only the delimited data. Highlight the clearest trend, one win to repeat, one thing to stop, and explicitly hedge any finding with n < 10.`;
}
