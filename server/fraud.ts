import type { Row } from "./nova.ts";
import type { BeneficiaryChange, FraudWarning } from "../src/types/finance.ts";
export function checkBeneficiaryChanges(
  sources: Record<string, Row[]>,
  windowDays = 7,
): BeneficiaryChange[] {
  const alerts: BeneficiaryChange[] = [];
  for (const change of sources["master-data-changes"] ?? []) {
    if (change.entity_type !== "vendor_bank_account") continue;
    const account = (sources["vendor-bank-accounts"] ?? []).find(
      (a) => a.id === change.entity_id,
    );
    if (!account) continue;
    const payments = (sources["vendor-payments"] ?? []).filter((p) => {
      const days =
        (Date.parse(p.initiated_at) - Date.parse(change.changed_at)) / 86400000;
      return (
        p.beneficiary_account_id === account.id &&
        days >= 0 &&
        days <= windowDays
      );
    });
    if (!payments.length) continue;
    const vendor = (sources.vendors ?? []).find(
      (v) => v.id === account.vendor_id,
    );
    const days = Math.floor(
      Math.min(
        ...payments.map(
          (p) =>
            (Date.parse(p.initiated_at) - Date.parse(change.changed_at)) /
            86400000,
        ),
      ),
    );
    const successful = payments.filter((p) => p.status === "success");
    alerts.push({
      id: change.id,
      vendorName: vendor?.name ?? account.holder_name ?? "Unresolved vendor",
      gstin: vendor?.gst_number ?? "",
      changeDate: change.changed_at,
      daysAgo: days,
      oldAccount: change.field?.includes("account")
        ? String(change.old_value ?? "Unknown")
        : "Not supplied",
      newAccount: account.account_last4
        ? `•••• ${account.account_last4}`
        : "Not supplied",
      oldIfsc:
        change.field === "ifsc"
          ? String(change.old_value ?? "")
          : "Not supplied",
      newIfsc: account.ifsc ?? "Not supplied",
      changedBy: change.changed_by ?? "Not supplied",
      coolingOffHoursRemaining: 0,
      pennyDropStatus: account.verified ? "verified" : "pending",
      sourceVerified: account.verified,
      scheduledPayoutsTotal:
        successful.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) /
        100,
      activeStatus: "under_review",
      paymentIds: payments.map((p) => p.id),
      transactionIds: successful
        .map((p) => p.bank_transaction_id)
        .filter(Boolean),
      reason: `${payments.length} payment record(s) within ${windowDays} days of ${change.field ?? "bank details"} change; ${successful.length} successful. Account verification: ${account.verified === true ? "verified by Nova" : account.verified === false ? "unverified" : "unknown"}. Review before any further processing.`,
    });
  }
  return alerts;
}
export function warningForAlert(alert: BeneficiaryChange): FraudWarning {
  return {
    severity: alert.sourceVerified ? "medium" : "high",
    reason: alert.reason!,
    beneficiaryModifiedDaysAgo: alert.daysAgo,
    previousIfsc: alert.oldIfsc,
    newIfsc: alert.newIfsc,
    previousAccount: alert.oldAccount,
    newAccount: alert.newAccount,
    coolingOffPeriodExpired: false,
    pennyDropStatus: alert.pennyDropStatus,
  };
}
