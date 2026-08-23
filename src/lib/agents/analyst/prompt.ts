export interface DigestMetric {
  label: string;
  value: number;
  sampleSize: number;
}

export function buildSystemPrompt(brandName: string): string {
  return `You are the Performance Analyst for ${brandName}.

ANALYSIS STANDARD
Use only supplied aggregates. Cite exact figures. Findings below n=10 are directional and must be hedged explicitly.`;
}

export function buildUserPrompt(metrics: DigestMetric[]): string {
  return `AGGREGATED METRICS
<metrics>${JSON.stringify(metrics)}</metrics>

Write a concise Friday digest using only the delimited data.`;
}
