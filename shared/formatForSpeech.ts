/** Format a rupee value for clear spoken Indian currency units. */
export function formatRupees(amount: number): string {
  if (amount === 0) return "zero rupees";
  const absolute = Math.abs(amount);
  if (absolute >= 1_00_00_000) return `${Number((amount / 1_00_00_000).toFixed(2))} crore rupees`;
  if (absolute >= 1_00_000) return `${Number((amount / 1_00_000).toFixed(1))} lakh rupees`;
  if (absolute >= 1_000) return `${Number((amount / 1_000).toFixed(1))} thousand rupees`;
  return `${Math.round(amount)} rupees`;
}

/** Pure, shared speech boundary: safe for both the server and browser. */
export function formatForSpeech(text: string): string {
  const convertedAmounts: string[] = [];
  const formatted = text
    .replace(/Status comes from Nova[’']s fixed dataset date\.?/gi, "")
    .replace(/(-\s*)?₹\s*(-?\s*\d[\d,]*(?:\.\d+)?)/g, (_match, leadingMinus: string | undefined, amount: string) => {
      const value = Number(amount.replace(/[,\s]/g, ""));
      const spoken = Number.isFinite(value)
        ? formatRupees(leadingMinus ? -Math.abs(value) : value).replace(/^-/, "minus ")
        : "an unavailable amount in rupees";
      // Keep a rounded 99.99-lakh raw amount below the crore threshold.
      convertedAmounts.push(spoken);
      return `\uE000${convertedAmounts.length - 1}\uE001`;
    })
    .replace(/(?<![\d.,])(\d+(?:\.\d+)?)\s+lakhs?\b/gi, (match, number: string) => {
      const lakhs = Number(number);
      return lakhs >= 100 ? `${Number((lakhs / 100).toFixed(2))} crore` : match;
    })
    .replace(/₹/g, "rupees")
    .replace(/[()]/g, ", ")
    .replace(/;/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*(?=[,.!?]|$)/g, "")
    .replace(/([.!?])\s*,/g, "$1")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
  return formatted.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => convertedAmounts[Number(index)]);
}
