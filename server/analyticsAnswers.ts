/* Repository touch marker. */
import type { AppState } from "../src/types/finance.ts";
import { filterTransactions, summarize, spendingGroups, shiftDays } from "../src/lib/analyticsMath.ts";
import { formatRupees } from "../shared/formatForSpeech.ts";
import { mentionsDate, questionDates } from "./questionDates.ts";

const spokenDate = (date: string) => new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));

function relativePeriod(question: string, latest: string): { start: string; end: string } | null {
  const q = question.toLowerCase();
  if (/\blast month\b/.test(q)) {
    const lastDay = shiftDays(`${latest.slice(0, 7)}-01`, -1);
    return { start: `${lastDay.slice(0, 7)}-01`, end: lastDay };
  }
  if (/\bthis month\b|\bcurrent month\b/.test(q))
    return { start: `${latest.slice(0, 7)}-01`, end: latest };
  const monday = shiftDays(latest, -((new Date(`${latest}T00:00:00Z`).getUTCDay() + 6) % 7));
  if (/\blast week\b/.test(q)) return { start: shiftDays(monday, -7), end: shiftDays(monday, -1) };
  if (/\bthis week\b|\bcurrent week\b/.test(q)) return { start: monday, end: latest };
  if (/\b(?:last|past)\s+(?:7|seven)\s+days\b/.test(q)) return { start: shiftDays(latest, -6), end: latest };
  return null;
}

/** Answer statement questions with the same row filters and transfer rules as Analytics. */
export function analyticsAnswer(question: string, state: AppState): string | null {
  const q = question.toLowerCase();
  const requested = questionDates(question);
  if (!requested && mentionsDate(question)) return "I couldn't read a valid date in that question. Please include the day, month, and year.";
  const cashFlowQuestion = /cash\s*flow|cash\s*movement|money\s+in|money\s+out|net\s+(?:flow|movement)|\binflow\b|\boutflow\b/i.test(question);
  if (!requested && /\b(?:latest|last|most recent)\s+(?:bank\s+)?transaction\b/.test(q)) {
    const latest = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.lineNo ?? 0) - (a.lineNo ?? 0))[0];
    if (!latest) return "I don't have imported bank transactions yet.";
    const direction = latest.type === "credit" ? "receipt from" : "payment to";
    return `The latest bank transaction was a ${direction} ${latest.vendorClientName} for ${formatRupees(latest.amount)} on ${spokenDate(latest.date)}.`;
  }
  const dates = state.transactions.map(tx => tx.date).sort();
  const first = dates[0];
  const last = dates.at(-1);
  const relative = last ? relativePeriod(question, last) : null;
  if (!requested && !cashFlowQuestion && !relative) return null;
  if (requested && !/cash|balance|flow|movement|money|spend|spent|expense|outflow|category|review|queue|pending|fraud|risk|flagged|transactions?|entries|lines/.test(q))
    return "I can analyze cash flow, balances, spending, review counts, and statement lines for a specific date. Please ask about one of those.";
  if (!first || !last) return "I don't have imported bank statement transactions to answer that yet.";

  const start = requested?.start ?? relative?.start ?? (shiftDays(last, -6) < first ? first : shiftDays(last, -6));
  const end = requested?.end ?? relative?.end ?? last;
  if (start > end) return "The start date comes after the end date. Please ask again with the dates in order.";
  if (end < first || start > last) {
    const asked = start === end ? spokenDate(start) : `${spokenDate(start)} through ${spokenDate(end)}`;
    return `I don't have bank statement data for ${asked}. The imported statements cover ${spokenDate(first)} through ${spokenDate(last)}.`;
  }
  const coveredStart = start < first ? first : start;
  const coveredEnd = end > last ? last : end;
  const partial = coveredStart !== start || coveredEnd !== end;
  const rows = filterTransactions(state.transactions, { start: coveredStart, end: coveredEnd, bankId: "" });
  const label = coveredStart === coveredEnd ? `on ${spokenDate(coveredStart)}` : `from ${spokenDate(coveredStart)} through ${spokenDate(coveredEnd)}`;
  const coverage = partial ? ` I only have statements from ${spokenDate(first)} through ${spokenDate(last)}.` : "";

  if (/\b(?:balance|cash position|closing cash)\b/.test(q) && !cashFlowQuestion) {
    const point = state.analytics.cashTimeline?.filter(item => item.date <= coveredEnd).at(-1);
    return point
      ? `Your end-of-day cash balance ${label} was ${formatRupees(point.balance)}.${coverage}`
      : `I don't have a recorded cash balance ${label}.${coverage}`;
  }

  const totals = summarize(rows);
  if (/review|queue|pending categor/.test(q) && !cashFlowQuestion)
    return `${totals.pendingCount} transaction${totals.pendingCount === 1 ? "" : "s"} needed review ${label}.${coverage}`;
  if (/fraud|risk|flagged/.test(q))
    return `${totals.fraudCount} transaction risk flag${totals.fraudCount === 1 ? "" : "s"} ${label}.${coverage}`;
  if (/\b(?:transactions?|entries|lines)\b/.test(q) && !cashFlowQuestion && !/spend|spent|expense|outflow/.test(q))
    return `I found ${rows.length} bank statement line${rows.length === 1 ? "" : "s"} ${label}.${coverage}`;
  if (/spend|spent|expense|outflow|category/.test(q) && !cashFlowQuestion) {
    const groups = spendingGroups(rows);
    const top = groups.slice(0, 3).map(group => `${formatRupees(group.amountPaise / 100)} on ${group.name}`);
    const detail = top.length ? ` The largest categories were ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(top)}.` : "";
    return `You spent ${formatRupees(totals.moneyOutPaise / 100)} ${label}, excluding internal transfers.${detail}${coverage}`;
  }

  const net = totals.moneyInPaise - totals.moneyOutPaise;
  const movement = net > 0 ? `a net inflow of ${formatRupees(net / 100)}`
    : net < 0 ? `a net outflow of ${formatRupees(-net / 100)}` : "no net movement";
  const reviews = /review|queue|pending categor/.test(q) ? ` ${totals.pendingCount} of those lines need review.` : "";
  return `Cash flow ${label} was ${formatRupees(totals.moneyInPaise / 100)} in and ${formatRupees(totals.moneyOutPaise / 100)} out, with ${movement}. Internal transfers are excluded.${reviews}${coverage}`;
}
