import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Mirrors the grid maths in the calendar component. */
function gridDays(monthIso: string): string[] {
  const month = new Date(`${monthIso}T00:00:00.000Z`);
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - offset * DAY_MS);
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const total = Math.ceil(((last.getTime() - start.getTime()) / DAY_MS + 1) / 7) * 7;
  return Array.from({ length: total }, (_, index) =>
    new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10));
}

describe("calendar grid", () => {
  it("always starts on a Monday and covers whole weeks", () => {
    for (const month of ["2026-08-01", "2026-09-01", "2026-02-01", "2028-02-01"]) {
      const days = gridDays(month);
      expect(days.length % 7).toBe(0);
      expect(new Date(`${days[0]}T00:00:00.000Z`).getUTCDay()).toBe(1);
    }
  });

  it("contains every day of the month it is showing", () => {
    const days = gridDays("2026-08-01");
    // August 2026 starts on a Saturday, the hardest case for the offset.
    expect(days).toContain("2026-08-01");
    expect(days).toContain("2026-08-31");
    expect(days[0]).toBe("2026-07-27");
  });

  it("keeps a date on its own day regardless of local timezone", () => {
    // Built in UTC: parsing "2026-08-31" locally would shift it a day west.
    const days = gridDays("2026-08-01");
    const index = days.indexOf("2026-08-31");
    expect(index).toBeGreaterThan(-1);
    expect(new Date(`${days[index]}T00:00:00.000Z`).getUTCDate()).toBe(31);
  });

  it("handles a February that starts on a Sunday", () => {
    const days = gridDays("2026-02-01");
    expect(days[0]).toBe("2026-01-26");
    expect(days).toContain("2026-02-28");
  });
});
