export const RATES: Record<string, { input: number; output: number }> = {
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.1-flash-image": { input: 0.5, output: 60 },
  "gemini-3.1-flash-lite-image": { input: 0.25, output: 30 },
  "gemini-3-pro-image": { input: 2, output: 120 },
};

export function computeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = RATES[modelId];
  if (!rate) throw new Error(`No rate configured for model ${modelId}`);
  return (inputTokens / 1e6) * rate.input + (outputTokens / 1e6) * rate.output;
}
