/* Repository touch marker. */
export type PaymentRail =
  | "NEFT"
  | "RTGS"
  | "UPI"
  | "IMPS"
  | "NACH"
  | "INTERNAL"
  | "CHEQUE"
  | "CASH"
  | "CARD"
  | "OTHER";

export type TransactionStatus =
  "categorized" | "needs_review" | "flagged_fraud" | "vouched";

export type CitationType =
  | "rule"
  | "gstin_match"
  | "llm_inference"
  | "historical_pattern"
  | "source_match"
  | "human"
  | "unresolved";

export interface Citation {
  type: CitationType;
  ruleId?: string;
  ruleName?: string;
  explanation: string;
  confidence: number;
  sourceDocument?: string;
  matchingKey?: string;
}

export interface FraudWarning {
  severity: "critical" | "high" | "medium";
  reason: string;
  beneficiaryModifiedDaysAgo: number;
  previousIfsc: string;
  newIfsc: string;
  previousAccount: string;
  newAccount: string;
  coolingOffPeriodExpired: boolean;
  pennyDropStatus: "pending" | "failed" | "name_mismatch" | "verified";
}

export interface Transaction {
  origin?: "phone" | "n8n";
  receivedAt?: string;
  accountId?: string;
  signedPaise?: number;
  lineNo?: number;
  bankRef?: string;
  chequeNo?: string;
  counterpartyText?: string;
  runningBalance?: number;
  categoryId?: string;
  transferId?: string;
  duplicateIds?: string[];
  recurring?: boolean;
  isDuplicate?: boolean;
  isRecurring?: boolean;
  isInternalTransfer?: boolean;
  subscriptionId?: string;
  trace?: TraceEvent[];
  id: string;
  date: string; // YYYY-MM-DD
  rawNarration: string;
  cleanedNarration: string;
  amount: number;
  type: "debit" | "credit";
  rail: PaymentRail;
  accountNumber: string;
  bankName: string;
  category: string;
  subCategory: string;
  vendorClientName: string;
  gstin?: string;
  itcEligible: boolean;
  tdsSection?: string;
  status: TransactionStatus;
  confidence: number;
  citation: Citation;
  sourceEvidence?: Citation;
  sourceCategoryId?: string;
  fraudWarning?: FraudWarning;
  shareToken: string;
  notes?: string;
}

export interface BeneficiaryChange {
  reason?: string;
  paymentIds?: string[];
  transactionIds?: string[];
  sourceVerified?: boolean;
  id: string;
  vendorName: string;
  gstin: string;
  changeDate: string;
  daysAgo: number;
  oldAccount: string;
  newAccount: string;
  oldIfsc: string;
  newIfsc: string;
  changedBy: string;
  coolingOffHoursRemaining: number;
  pennyDropStatus: "name_mismatch" | "failed" | "verified" | "pending";
  scheduledPayoutsTotal: number;
  activeStatus: "frozen" | "under_review" | "verified" | "acknowledged";
}

export interface VoiceNote {
  id: string;
  recordedAt: string;
  durationSeconds: number;
  transcript: string;
  extractedEntity: string;
  extractedAmount: number;
  extractedCategory: string;
  matchedTransactionId?: string;
  status: "pending_match" | "reconciled" | "draft";
}

export interface AnalyticsSummary {
  categoryTotals?: { category: string; amount: number }[];
  cashTimeline?: { date: string; balance: number }[];
  topCounterparties?: { name: string; amount: number }[];
  reviewTrend?: { date: string; count: number }[];
  duplicateCount?: number;
  recurringCount?: number;
  transferCount?: number;
  cashPosition: number;
  inflowThisMonth: number;
  outflowThisMonth: number;
  eligibleItcClaim: number;
  reviewQueueCount: number;
  fraudAlertsCount: number;
  categorizationAccuracyPct: number;
}

export interface TraceEvent {
  stage: string;
  status: "passed" | "skipped" | "warning";
  reason: string;
  source?: string;
  confidence?: number;
}
export interface BankAccountSummary {
  id: string;
  bank: string;
  accountLast4: string;
  purpose: string;
  statementFormat: string;
  openingBalance: number;
}
export interface SubscriptionSummary {
  id: string;
  name: string;
  vendorName: string;
  billingCycle: "monthly" | "quarterly" | "annual" | string;
  currentAmount: number;
  renewalDate: string;
  lastUsedOn?: string;
  status: string;
  autoRenew: boolean;
}
export interface AppState {
  planning?: import("../../shared/planning.ts").PlanningState;
  importedTransactionCount?: number;
  liveTransactionCount?: number;
  transactions: Transaction[];
  bankAccounts: BankAccountSummary[];
  subscriptions: SubscriptionSummary[];
  beneficiaryChanges: BeneficiaryChange[];
  voiceNotes: VoiceNote[];
  analytics: AnalyticsSummary;
  dataDate: string | null;
  syncedAt: string | null;
  warnings: string[];
  insights: string[];
  sync: { running: boolean; message: string; error?: string };
  configured: { nova: boolean; gemini: boolean; model: string };
}
