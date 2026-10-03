import type { Row } from "./nova.ts";
import type {
  Transaction,
  AnalyticsSummary,
  Citation,
} from "../src/types/finance.ts";
import { CATEGORIES, isCategory, type Category } from "../shared/categories.ts";
import { checkBeneficiaryChanges, warningForAlert } from "./fraud.ts";
export type Sources = Record<string, Row[]>;
export interface Review {
  id: string;
  category: Category;
  pattern?: string;
  action: string;
  createdAt?: string;
}
export const paise = (amount: number) => {
  if (!Number.isFinite(amount)) throw Error("Invalid monetary amount");
  const n = Math.round(amount * 100);
  if (!Number.isSafeInteger(n)) throw Error("Amount outside safe range");
  return n;
};
export const canonical = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const daysBetween = (a: string, b: string) =>
  Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000;
export function ruleCategory(
  text: string,
): { category: Category; reason: string } | null {
  const rules: [RegExp, Category, string][] = [
    [/\b(SAL|SALARY|PAYROLL)\b/i, "salary_payment", "Salary narration"],
    [
      /\b(GST|GSTR3B|TDS|EPFO|ESIC|ADVANCE TAX)\b/i,
      "tax_payment",
      "Statutory payment narration",
    ],
    [/\b(EMI|LOAN REPAYMENT)\b/i, "loan_repayment", "Loan repayment narration"],
    [
      /\b(CHARGES?|CHG|FEE|COMMISSION)\b/i,
      "bank_charges",
      "Bank charge narration",
    ],
    [/\b(RENT|LEASE)\b/i, "rent", "Rent narration"],
    [/\b(AWS|AZURE|SAAS|CLOUD|SOFTWARE)\b/i, "software", "Software narration"],
    [
      /\b(ELECTRICITY|BROADBAND|TELECOM|WATER BILL)\b/i,
      "utilities",
      "Utility narration",
    ],
    [/\b(INSURANCE|PREMIUM)\b/i, "insurance", "Insurance narration"],
    [
      /\b(TRAVEL|TRANSPORT|FREIGHT|LOGISTICS)\b/i,
      "travel",
      "Travel or transport narration",
    ],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? { category: match[1], reason: match[2] } : null;
}
function apply(
  tx: Transaction,
  category: Category,
  evidence: Citation,
  status: Transaction["status"] = "categorized",
) {
  tx.categoryId = category;
  tx.category = CATEGORIES[category];
  tx.subCategory = evidence.type.replaceAll("_", " ");
  tx.citation = evidence;
  tx.confidence = evidence.confidence;
  tx.status = status;
}
export function buildDataset(
  sources: Sources,
  reviews: Review[] = [],
  windowDays = 7,
) {
  const accounts = sources["bank-accounts"] ?? [];
  const entities = [...(sources.clients ?? []), ...(sources.vendors ?? [])];
  const transactions: Transaction[] = (sources["bank-transactions"] ?? []).map(
    (row) => {
      const account = accounts.find((a) => a.id === row.account_id);
      if (!account || !row.id || !/^\d{4}-\d{2}-\d{2}$/.test(row.value_date))
        throw Error("Invalid bank transaction or account");
      const signed = paise(row.credit ?? 0) - paise(row.debit ?? 0);
      const text = String(row.raw_narration ?? "");
      const party = String(row.counterparty_text ?? "").trim();
      const name = canonical(party);
      const candidates =
        name.length >= 4
          ? entities.filter(
              (e) =>
                canonical(e.name ?? "").includes(name) ||
                name.includes(canonical(e.name ?? "") || "\0"),
            )
          : [];
      const resolved = candidates.length === 1 ? candidates[0] : undefined;
      const rail =
        text
          .match(/\b(NEFT|RTGS|UPI|IMPS|NACH|CHEQUE|CASH|CARD)\b/i)?.[1]
          ?.toUpperCase() ?? (row.cheque_no ? "CHEQUE" : "OTHER");
      return {
        id: row.id,
        accountId: row.account_id,
        date: row.value_date,
        amount: Math.abs(signed) / 100,
        signedPaise: signed,
        lineNo: row.line_no ?? 0,
        rawNarration: text,
        cleanedNarration: resolved?.name ?? party,
        counterpartyText: party,
        bankRef: row.bank_ref ?? "",
        chequeNo: row.cheque_no ?? "",
        runningBalance:
          typeof row.running_balance === "number"
            ? row.running_balance
            : undefined,
        type: signed < 0 ? "debit" : "credit",
        rail: rail as Transaction["rail"],
        accountNumber: account.account_last4
          ? `•••• ${account.account_last4}`
          : account.id,
        bankName: account.bank ?? "Bank",
        categoryId: "uncategorized",
        category: CATEGORIES.uncategorized,
        subCategory: "Awaiting evidence",
        vendorClientName:
          resolved?.name ?? (party || "Unresolved counterparty"),
        gstin: resolved?.gst_number ?? undefined,
        itcEligible: false,
        status: "needs_review",
        confidence: 0,
        shareToken: "",
        citation: {
          type: "unresolved",
          explanation: "No supporting source or confident rule found.",
          confidence: 0,
        },
        trace: [
          {
            stage: "Fetched",
            status: "passed",
            reason: `Account Aggregator (AA) Bank Sync bank-transactions/${row.id}`,
          },
          {
            stage: "Normalized",
            status: "passed",
            reason: `${account.statement_format ?? "bank"} statement; signed amount ${signed} paise.`,
          },
        ],
      } as Transaction;
    },
  );
  const linkedResources: [string, Category][] = [
    ["payments", "customer_receipt"],
    ["vendor-payments", "vendor_payment"],
    ["loan-schedules", "loan_repayment"],
    ["payroll-runs", "salary_payment"],
    ["statutory-dues", "tax_payment"],
    ["settlements", "gateway_settlement"],
  ];
  for (const tx of transactions) {
    for (const [resource, category] of linkedResources) {
      const record = (sources[resource] ?? []).find(
        (r) => r.bank_transaction_id === tx.id,
      );
      if (!record) continue;
      const related = [
        record.invoice_id && `invoice ${record.invoice_id}`,
        record.client_id && `client ${record.client_id}`,
        record.vendor_id && `vendor ${record.vendor_id}`,
        record.loan_id && `loan ${record.loan_id}`,
      ]
        .filter(Boolean)
        .join("; ");
      apply(tx, category, {
        type: "source_match",
        sourceDocument: `${resource}/${record.id}`,
        matchingKey: tx.id,
        explanation: `Explicit bank transaction link to ${resource}/${record.id}${related ? `; ${related}` : ""}.`,
        confidence: 100,
      });
      const entity = entities.find(
        (e) => e.id === (record.client_id ?? record.vendor_id),
      );
      if (entity) {
        tx.vendorClientName = entity.name;
        tx.gstin = entity.gst_number;
      }
      break;
    }
    tx.trace!.push({
      stage: "Ground truth",
      status: tx.categoryId === "uncategorized" ? "skipped" : "passed",
      reason: tx.citation.explanation,
      source: tx.citation.sourceDocument,
    });
    const exactReview = reviews.find((r) => r.id === tx.id);
    const prior =
      exactReview ??
      (tx.categoryId === "uncategorized"
        ? reviews.find(
            (r) =>
              r.pattern &&
              r.pattern === canonical(tx.counterpartyText ?? "") &&
              r.action !== "flag" &&
              r.category !== "internal_transfer",
          )
        : undefined);
    if (prior && isCategory(prior.category) && prior.action !== "flag") {
      const source =
        tx.citation.type === "source_match" ? { ...tx.citation } : undefined;
      const conflict = source && tx.categoryId !== prior.category;
      if (source) tx.sourceCategoryId = tx.categoryId;
      apply(
        tx,
        prior.category,
        {
          type: "human",
          sourceDocument: `reviews/${prior.id}`,
          explanation: conflict
            ? `Human/source conflict: reviewer chose ${CATEGORIES[prior.category]}; source evidence ${source.sourceDocument}: ${source.explanation}`
            : exactReview
              ? "Category confirmed by a human reviewer."
              : `Reused human correction for counterparty "${tx.counterpartyText}".`,
          confidence: 100,
        },
        conflict ? "needs_review" : "categorized",
      );
      if (source) tx.sourceEvidence = source;
    }
    tx.trace!.push({
      stage: "Human corrections",
      status: prior && prior.action !== "flag" ? "passed" : "skipped",
      reason:
        prior && prior.action !== "flag"
          ? tx.citation.explanation
          : "No applicable saved correction.",
    });
  }
  for (const tx of transactions) {
    if (tx.categoryId === "uncategorized") {
      const fallback: [string, Category, string, string, string?][] = [
        ["payroll-runs", "salary_payment", "net", "pay_date", "account_id"],
        [
          "settlements",
          "gateway_settlement",
          "net_amount",
          "settlement_date",
          "payout_account_id",
        ],
        ["statutory-dues", "tax_payment", "amount", "paid_date"],
      ];
      for (const [
        resource,
        cat,
        amountField,
        dateField,
        accountField,
      ] of fallback) {
        const rows = (sources[resource] ?? []).filter(
          (r) =>
            r[dateField] === tx.date &&
            paise(r[amountField] ?? 0) === Math.abs(tx.signedPaise!) &&
            (!accountField || r[accountField] === tx.accountId) &&
            (cat === "gateway_settlement"
              ? tx.type === "credit" && r.status === "settled"
              : tx.type === "debit"),
        );
        if (rows.length !== 1) continue;
        const competing = transactions.filter(
          (t) =>
            t.date === tx.date &&
            t.type === tx.type &&
            Math.abs(t.signedPaise!) === Math.abs(tx.signedPaise!) &&
            (!accountField || t.accountId === tx.accountId),
        );
        if (competing.length !== 1) continue;
        apply(tx, cat, {
          type: "source_match",
          sourceDocument: `${resource}/${rows[0].id}`,
          explanation: `Unique ${accountField ? "account, " : ""}date and amount match with ${resource}/${rows[0].id}; no direct bank link supplied.`,
          confidence: accountField ? 95 : 85,
        });
        break;
      }
    }
    if (tx.categoryId === "uncategorized" && tx.counterpartyText) {
      const expense = (sources.expenses ?? []).filter(
        (e) =>
          e.expense_date === tx.date &&
          paise(e.total_amount ?? 0) === Math.abs(tx.signedPaise!) &&
          canonical(e.vendor_name ?? "") ===
            canonical(tx.counterpartyText ?? "") &&
          tx.type === "debit",
      );
      if (expense.length === 1)
        apply(tx, "other_expense", {
          type: "source_match",
          sourceDocument: `expenses/${expense[0].id}`,
          explanation: `Expense date, vendor and amount match; expense category ${expense[0].category}.`,
          confidence: 85,
        });
    }
  }
  const candidates = transactions.filter(
    (t) =>
      (t.categoryId === "uncategorized" ||
        t.categoryId === "internal_transfer") &&
      t.signedPaise !== 0,
  );
  const peers = (tx: Transaction) =>
    candidates.filter(
      (other) =>
        other.id !== tx.id &&
        other.accountId !== tx.accountId &&
        other.signedPaise === -tx.signedPaise! &&
        daysBetween(other.date, tx.date) <= 2,
    );
  for (const tx of candidates) {
    const matches = peers(tx);
    if (matches.length !== 1 || peers(matches[0]).length !== 1 || tx.transferId)
      continue;
    const peer = matches[0];
    const id = [tx.id, peer.id].sort().join(":");
    for (const item of [tx, peer]) {
      item.transferId = id;
      item.rail = "INTERNAL";
      apply(item, "internal_transfer", {
        type: "rule",
        ruleId: "owned-account-pair",
        explanation: `Equal opposite movements on owned accounts within two days: ${id}.`,
        confidence: 95,
      });
    }
  }
  for (const tx of transactions) {
    if (tx.categoryId === "uncategorized") {
      const rule = ruleCategory(`${tx.rawNarration} ${tx.counterpartyText}`);
      if (rule)
        apply(
          tx,
          rule.category,
          {
            type: "rule",
            ruleId: rule.category,
            ruleName: rule.reason,
            explanation: `${rule.reason}; no linked accounting record. Please verify.`,
            confidence: 75,
          },
          "needs_review",
        );
    }
    tx.trace!.push({
      stage: "Rules & matching",
      status:
        tx.citation.type === "rule" || tx.citation.type === "source_match"
          ? "passed"
          : "skipped",
      reason: tx.citation.explanation,
      source: tx.citation.sourceDocument,
      confidence: tx.confidence,
    });
  }
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const keys = [
      `exact:${tx.accountId}:${tx.date}:${tx.signedPaise}:${canonical(tx.rawNarration)}`,
    ];
    if (tx.bankRef) keys.push(`ref:${tx.accountId}:${tx.bankRef}`);
    if (tx.chequeNo) keys.push(`cheque:${tx.accountId}:${tx.chequeNo}`);
    for (const key of keys) {
      const group = groups.get(key) ?? [];
      group.push(tx);
      groups.set(key, group);
    }
  }
  for (const group of groups.values())
    if (group.length > 1)
      for (const tx of group)
        tx.duplicateIds = [
          ...new Set([
            ...(tx.duplicateIds ?? []),
            ...group.filter((t) => t.id !== tx.id).map((t) => t.id),
          ]),
        ];
  const insights: string[] = [];
  const dataDate =
    transactions
      .map((t) => t.date)
      .sort()
      .at(-1) ?? null;
  const firstDate = transactions.map((t) => t.date).sort()[0];
  const byParty = new Map<string, Transaction[]>();
  for (const tx of transactions.filter(
    (t) => t.counterpartyText && !t.transferId,
  )) {
    const key = `${canonical(tx.counterpartyText!)}:${tx.type}`;
    const group = byParty.get(key) ?? [];
    group.push(tx);
    byParty.set(key, group);
  }
  for (const group of byParty.values()) {
    group.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 2; i < group.length; i++) {
      const trio = group.slice(i - 2, i + 1);
      const amounts = trio.map((t) => Math.abs(t.signedPaise!));
      const intervals = [
        daysBetween(trio[1].date, trio[0].date),
        daysBetween(trio[2].date, trio[1].date),
      ];
      if (
        intervals[0] >= 7 &&
        Math.abs(intervals[1] - intervals[0]) <= 4 &&
        Math.max(...amounts) - Math.min(...amounts) <=
          Math.max(...amounts) * 0.05
      )
        trio.forEach((t) => (t.recurring = true));
    }
  }
  for (const sub of sources.subscriptions ?? []) {
    if (sub.billing_channel !== "bank" || sub.status !== "active" || !dataDate)
      continue;
    const months =
      sub.billing_cycle === "annual"
        ? 12
        : sub.billing_cycle === "quarterly"
          ? 3
          : 1;
    const renewal = new Date(`${sub.renewal_date}T00:00:00Z`);
    if (!Number.isFinite(renewal.getTime())) continue;
    while (renewal.toISOString().slice(0, 10) > dataDate)
      renewal.setUTCMonth(renewal.getUTCMonth() - months);
    const dates = [renewal.toISOString().slice(0, 10)];
    renewal.setUTCMonth(renewal.getUTCMonth() - months);
    dates.push(renewal.toISOString().slice(0, 10));
    const hits = transactions.filter(
      (t) =>
        t.type === "debit" &&
        canonical(t.vendorClientName).includes(
          canonical(sub.vendor_name ?? "") || "\0",
        ) &&
        Math.abs(Math.abs(t.signedPaise!) - paise(sub.current_amount)) <=
          Math.max(100, paise(sub.current_amount) * 0.02),
    );
    hits.forEach((t) => (t.recurring = true));
    if (
      dates.every(
        (d) =>
          d >= firstDate &&
          d >= (sub.started_on ?? firstDate) &&
          !hits.some((t) => daysBetween(t.date, d) <= 5),
      )
    )
      insights.push(
        `${sub.vendor_name}: no matching bank debit for two covered ${sub.billing_cycle} cycles.`,
      );
  }
  const beneficiaryChanges = checkBeneficiaryChanges(sources, windowDays);
  for (const tx of transactions) {
    const alert = beneficiaryChanges.find((a) =>
      a.transactionIds?.includes(tx.id),
    );
    if (alert) {
      tx.fraudWarning = warningForAlert(alert);
      tx.status = "flagged_fraud";
      tx.trace!.push({
        stage: "Beneficiary warning",
        status: "warning",
        reason: alert.reason!,
        source: `master-data-changes/${alert.id}`,
      });
    }
    if (reviews.find((r) => r.id === tx.id && r.action === "flag"))
      tx.status = "flagged_fraud";
    if (
      tx.duplicateIds?.length &&
      tx.status !== "flagged_fraud" &&
      !reviews.some((r) => r.id === tx.id)
    )
      tx.status = "needs_review";
  }
  return {
    transactions,
    analytics: analyze(transactions, accounts),
    beneficiaryChanges,
    insights,
    dataDate,
  };
}
export function finalizeTrace(tx: Transaction) {
  tx.trace = (tx.trace ?? []).filter((e) => e.stage !== "Final decision");
  tx.trace.push({
    stage: "Final decision",
    status: tx.status === "categorized" ? "passed" : "warning",
    reason:
      tx.status === "categorized"
        ? `${tx.category}: ${tx.citation.explanation}`
        : `${tx.category} → ${tx.status === "flagged_fraud" ? "risk review" : "review queue"}. ${tx.citation.explanation}`,
    confidence: tx.confidence,
  });
}
export function analyze(
  transactions: Transaction[],
  accounts: Row[],
): AnalyticsSummary {
  const latest =
    transactions
      .map((t) => t.date)
      .sort()
      .at(-1) ?? "";
  const period = transactions.filter(
    (t) => t.date.startsWith(latest.slice(0, 7)) && !t.transferId,
  );
  const sum = (rows: Transaction[]) =>
    rows.reduce((n, t) => n + Math.abs(t.signedPaise ?? paise(t.amount)), 0) /
    100;
  const ordered = [...transactions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.lineNo ?? 0) - (b.lineNo ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const balances = new Map(
    accounts.map((a) => [a.id, paise(a.opening_balance ?? 0)]),
  );
  const timeline = new Map<string, number>();
  for (const tx of ordered) {
    balances.set(
      tx.accountId!,
      tx.runningBalance === undefined
        ? (balances.get(tx.accountId!) ?? 0) + tx.signedPaise!
        : paise(tx.runningBalance),
    );
    timeline.set(
      tx.date,
      [...balances.values()].reduce((s, n) => s + n, 0) / 100,
    );
  }
  const categories = new Map<string, number>();
  const parties = new Map<string, number>();
  const reviewTrend = new Map<string, number>();
  for (const tx of period) {
    if (tx.type === "debit")
      categories.set(
        tx.category,
        (categories.get(tx.category) ?? 0) + Math.abs(tx.signedPaise!),
      );
    parties.set(
      tx.vendorClientName,
      (parties.get(tx.vendorClientName) ?? 0) + Math.abs(tx.signedPaise!),
    );
  }
  for (const tx of transactions.filter(
    (t) => t.status === "needs_review" || t.status === "flagged_fraud",
  ))
    reviewTrend.set(tx.date, (reviewTrend.get(tx.date) ?? 0) + 1);
  return {
    cashPosition: [...balances.values()].reduce((s, n) => s + n, 0) / 100,
    inflowThisMonth: sum(period.filter((t) => t.type === "credit")),
    outflowThisMonth: sum(period.filter((t) => t.type === "debit")),
    eligibleItcClaim: 0,
    reviewQueueCount: transactions.filter(
      (t) => t.status === "needs_review" || t.status === "flagged_fraud",
    ).length,
    fraudAlertsCount: transactions.filter((t) => t.status === "flagged_fraud")
      .length,
    categorizationAccuracyPct: transactions.length
      ? (transactions.filter((t) => t.status === "categorized").length /
          transactions.length) *
        100
      : 0,
    categoryTotals: [...categories]
      .map(([category, amount]) => ({ category, amount: amount / 100 }))
      .sort((a, b) => b.amount - a.amount),
    topCounterparties: [...parties]
      .map(([name, amount]) => ({ name, amount: amount / 100 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    cashTimeline: [...timeline].map(([date, balance]) => ({ date, balance })),
    reviewTrend: [...reviewTrend]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    duplicateCount: transactions.filter((t) => t.duplicateIds?.length).length,
    recurringCount: transactions.filter((t) => t.recurring).length,
    transferCount: transactions.filter((t) => t.transferId).length,
  };
}
