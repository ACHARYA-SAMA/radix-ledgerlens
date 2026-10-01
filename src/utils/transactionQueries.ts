import { ANALYTICS_DATA, INITIAL_TRANSACTIONS } from '../data/mockTransactions.ts';
import type { Transaction } from '../types/finance.ts';

// Keep all reads of the mock ledger here. Replacing these six functions is the
// only change needed when the live Nova query API becomes available.
const latestDate = INITIAL_TRANSACTIONS.reduce(
  (latest, transaction) => transaction.date > latest ? transaction.date : latest,
  '0000-00-00',
);

export function getCashPosition() {
  return { amountRupees: ANALYTICS_DATA.cashPosition, asOf: latestDate, source: 'dashboard summary' };
}

export function getReviewQueueSummary() {
  return { count: ANALYTICS_DATA.reviewQueueCount, asOf: latestDate, source: 'dashboard summary' };
}

export interface SpendSummaryArgs { period?: string; category?: string }

export function getSpendSummary({ period = 'this_month', category }: SpendSummaryArgs = {}) {
  const normalizedPeriod = period.toLowerCase().replace(/[\s-]+/g, '_');
  if (!['this_week', 'this_month'].includes(normalizedPeriod)) {
    return { error: 'Only this_week and this_month are available in the fixed dataset.' };
  }
  if (normalizedPeriod === 'this_month' && !category) {
    return {
      period: normalizedPeriod,
      asOf: latestDate,
      spentRupees: ANALYTICS_DATA.outflowThisMonth,
      receivedRupees: ANALYTICS_DATA.inflowThisMonth,
      source: 'dashboard summary',
    };
  }
  const anchor = new Date(`${latestDate}T00:00:00Z`);
  const start = new Date(anchor);
  if (normalizedPeriod === 'this_week') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else {
    start.setUTCDate(1);
  }
  const startDate = start.toISOString().slice(0, 10);
  const categoryNeedle = category?.trim().toLowerCase();
  const matching = INITIAL_TRANSACTIONS.filter((transaction) =>
    transaction.date >= startDate && transaction.date <= latestDate &&
    (!categoryNeedle || transaction.category.toLowerCase().includes(categoryNeedle)),
  );
  return {
    period: normalizedPeriod,
    category: category || null,
    from: startDate,
    to: latestDate,
    spentRupees: matching.filter((tx) => tx.type === 'debit').reduce((sum, tx) => sum + tx.amount, 0),
    receivedRupees: matching.filter((tx) => tx.type === 'credit').reduce((sum, tx) => sum + tx.amount, 0),
    transactionCount: matching.length,
    source: 'matching sample transactions; this is not the full dashboard total',
  };
}

export function getFraudAlerts() {
  const alerts = INITIAL_TRANSACTIONS.filter((tx) => tx.status === 'flagged_fraud').map((tx) => ({
    id: tx.id,
    date: tx.date,
    vendor: tx.vendorClientName,
    amountRupees: tx.amount,
    beneficiaryChangedDaysAgo: tx.fraudWarning?.beneficiaryModifiedDaysAgo ?? null,
    severity: tx.fraudWarning?.severity ?? null,
  }));
  return { count: alerts.length, alerts, asOf: latestDate };
}

export interface SearchTransactionsArgs {
  counterparty?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  category?: string;
}

const searchNoise = new Set(['the', 'a', 'an', 'to', 'from', 'for', 'of', 'and', 'supplier', 'vendor', 'payment', 'transaction']);
function tokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !searchNoise.has(word));
}

function searchScore(transaction: Transaction, query: string): number {
  const name = transaction.vendorClientName.toLowerCase();
  const haystack = `${name} ${transaction.cleanedNarration} ${transaction.category} ${transaction.subCategory} ${transaction.rawNarration}`.toLowerCase();
  const words = tokens(query);
  if (!words.length) return 0;
  let score = 0;
  for (const word of words) {
    if (name.includes(word)) score += 3;
    else if (haystack.includes(word)) score += 1;
  }
  return score;
}

export function searchTransactions(args: SearchTransactionsArgs = {}) {
  const { counterparty, dateFrom, dateTo, minAmount, maxAmount, category } = args;
  if (![counterparty, dateFrom, dateTo, minAmount, maxAmount, category].some((value) => value !== undefined && value !== '')) {
    return { matches: [], reason: 'Provide at least one search criterion.', searchedSampleCount: INITIAL_TRANSACTIONS.length };
  }
  const categoryNeedle = category?.trim().toLowerCase();
  const matches = INITIAL_TRANSACTIONS
    .map((transaction) => ({ transaction, score: counterparty ? searchScore(transaction, counterparty) : 0 }))
    .filter(({ transaction, score }) =>
      (!counterparty || score > 0) &&
      (!dateFrom || transaction.date >= dateFrom) &&
      (!dateTo || transaction.date <= dateTo) &&
      (minAmount === undefined || transaction.amount >= minAmount) &&
      (maxAmount === undefined || transaction.amount <= maxAmount) &&
      (!categoryNeedle || transaction.category.toLowerCase().includes(categoryNeedle)),
    )
    .sort((a, b) => b.score - a.score || b.transaction.date.localeCompare(a.transaction.date))
    .slice(0, 5)
    .map(({ transaction }) => ({
      id: transaction.id,
      date: transaction.date,
      vendor: transaction.vendorClientName,
      amountRupees: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      status: transaction.status,
      description: transaction.cleanedNarration,
    }));
  return { matches, asOf: latestDate, searchedSampleCount: INITIAL_TRANSACTIONS.length };
}

export function getTransactionById({ id }: { id: string }) {
  return INITIAL_TRANSACTIONS.find((transaction) => transaction.id.toLowerCase() === id.toLowerCase()) ?? null;
}
