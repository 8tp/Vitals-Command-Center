/** Turn a range preset (7d/14d/30d/90d) or "YYYY-MM-DD..YYYY-MM-DD" into absolute dates. */
export function parseRange(input: string | undefined, fallback: number = 7): { start: string; end: string; days: number } {
  const end = todayIso();
  if (!input) return withDays(end, fallback);

  const presetMatch = /^(\d+)d$/.exec(input);
  if (presetMatch) return withDays(end, Number(presetMatch[1]));

  const customMatch = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(input);
  if (customMatch) {
    const [, start, customEnd] = customMatch as unknown as [string, string, string];
    const days = Math.max(1, Math.round(dayDiff(start, customEnd)) + 1);
    return { start, end: customEnd, days };
  }

  return withDays(end, fallback);
}

export function todayIso(): string {
  // Google returns civil/local dates, so "today" must be the system-local
  // calendar day — not the UTC day. A late-evening Central user would otherwise
  // request tomorrow's UTC date. en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA');
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return (db - da) / 86400000;
}

function withDays(end: string, days: number): { start: string; end: string; days: number } {
  return { start: addDaysIso(end, -(days - 1)), end, days };
}
