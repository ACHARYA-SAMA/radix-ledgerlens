/* Repository touch marker. */
const monthPattern = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const monthNumbers: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function mentionsDate(text: string): boolean {
  return /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(text)
    || new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+(?:${monthPattern})\\b`, "i").test(text)
    || new RegExp(`\\b(?:${monthPattern})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i").test(text);
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return date.toISOString().slice(0, 10);
}

export function questionDates(text: string): { start: string; end: string } | null {
  const found: { index: number; date: string }[] = [];
  for (const match of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const date = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) found.push({ index: match.index, date });
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthPattern})\\s*,?\\s+(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(dayFirst)) {
    const date = isoDate(Number(match[3]), monthNumbers[match[2].slice(0, 3).toLowerCase()], Number(match[1]));
    if (date) found.push({ index: match.index, date });
  }
  const monthFirst = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s+(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(monthFirst)) {
    const date = isoDate(Number(match[3]), monthNumbers[match[1].slice(0, 3).toLowerCase()], Number(match[2]));
    if (date) found.push({ index: match.index, date });
  }
  found.sort((a, b) => a.index - b.index);
  if (!found.length) return null;
  return { start: found[0].date, end: found[1]?.date ?? found[0].date };
}
