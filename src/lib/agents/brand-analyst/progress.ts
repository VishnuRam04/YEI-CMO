export interface BrandAnalystProgress {
  phase: "ingesting" | "model-output" | "persisting";
  text: string;
}

type ProgressListener = (progress: BrandAnalystProgress) => void;

const listeners = new Map<string, Set<ProgressListener>>();

export function reportBrandAnalystProgress(
  traceId: string,
  progress: BrandAnalystProgress,
): void {
  for (const listener of listeners.get(traceId) ?? []) {
    listener(progress);
  }
}

export async function withBrandAnalystProgress<T>(
  traceId: string,
  listener: ProgressListener,
  run: () => Promise<T>,
): Promise<T> {
  const traceListeners = listeners.get(traceId) ?? new Set<ProgressListener>();
  traceListeners.add(listener);
  listeners.set(traceId, traceListeners);

  try {
    return await run();
  } finally {
    traceListeners.delete(listener);
    if (traceListeners.size === 0) {
      listeners.delete(traceId);
    }
  }
}
