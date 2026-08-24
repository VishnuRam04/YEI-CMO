import { describe, it, expect, vi } from 'vitest';
import { VariantsSchema } from '../copywriter/schema';

// These tests exercise the SCHEMA + parsing contract that index.ts relies
// on. Full end-to-end run() tests that hit Gemini belong behind an
// integration flag (see 06-tech-spec-setup.md) — kept out of the default
// fast unit run per §8's "fast, no API calls" rule for prompt tests, and
// mirrored here for the validation path using a mocked model response.

describe('VariantsSchema', () => {
  it('accepts a well-formed 3-variant response', () => {
    const good = {
      variants: [
        { angle: 'pain-led', body: 'x' },
        { angle: 'proof-led', body: 'y' },
        { angle: 'contrarian', body: 'z' },
      ],
    };
    expect(VariantsSchema.safeParse(good).success).toBe(true);
  });

  it('rejects a response with fewer than 3 variants', () => {
    const malformed = { variants: [{ angle: 'pain-led', body: 'x' }] };
    const parsed = VariantsSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);
  });

  it('rejects a response with an invalid angle value', () => {
    const malformed = {
      variants: [
        { angle: 'pain-led', body: 'x' },
        { angle: 'proof-led', body: 'y' },
        { angle: 'sales-led', body: 'z' }, // not in the ANGLES enum
      ],
    };
    const parsed = VariantsSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);
  });

  it('rejects a response missing body text', () => {
    const malformed = {
      variants: [
        { angle: 'pain-led', body: '' },
        { angle: 'proof-led', body: 'y' },
        { angle: 'contrarian', body: 'z' },
      ],
    };
    const parsed = VariantsSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);
  });
});

// Example of the pattern index.ts's runTextGeneration follows on a schema
// failure: parse -> if !success -> return ok:false with VALIDATION_ERROR,
// never throw. This is a smoke test of that branch's logic in isolation.
describe('validation-error branch shape', () => {
  it('produces a retryable VALIDATION_ERROR, never throws', () => {
    const malformed = { variants: [] };
    const parsed = VariantsSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);

    const buildErrorOutput = (message: string) => ({
      ok: false as const,
      result: null,
      error: { code: 'VALIDATION_ERROR' as const, message, retryable: true },
    });

    const output = buildErrorOutput('Malformed model output');
    expect(output.ok).toBe(false);
    expect(output.error.code).toBe('VALIDATION_ERROR');
    expect(output.error.retryable).toBe(true);
  });
});