/* Repository touch marker. */
import { displayText } from "../../shared/branding.ts";
import { useState } from "react";
import type { PlanningState } from "../../shared/planning.ts";
import { FinanceDialog } from "./FinanceDialog.tsx";

export function ProfilePreferences({ plan, onSave, onClose }: { plan: PlanningState; onSave: (body: unknown) => Promise<void>; onClose: () => void }) {
  const [profile, setProfile] = useState({ ...plan.profile });
  const [revision] = useState(plan.revision);
  const [thresholds, setThresholds] = useState(profile.alertThresholds.join(", "));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <FinanceDialog title="Profile & alert preferences" onClose={onClose}><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await onSave({ action: "profile", revision, profile: { ...profile, alertThresholds: thresholds.split(",").map(s => Number(s.trim())) } }); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
    <p className="finance-hint">Set your targets. Alerts use your current statement period and update with incoming transactions.</p>
    <label>Profile name<input required maxLength={60} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label>
    <div className="finance-form-grid"><label>Monthly income target (₹)<input type="number" min="1" step="0.01" required value={profile.monthlyIncomeTarget} onChange={e => setProfile({ ...profile, monthlyIncomeTarget: Number(e.target.value) })} /></label><label>Savings target (%)<input type="number" min="0" max="100" required value={profile.savingsTargetPct} onChange={e => setProfile({ ...profile, savingsTargetPct: Number(e.target.value) })} /></label><label>Budget alert thresholds (%)<input required value={thresholds} onChange={e => setThresholds(e.target.value)} placeholder="75, 90, 100" /><small>Comma-separated; e.g. 75, 90, 100.</small></label><label>Large expense alert (₹)<input type="number" min="0.01" step="0.01" required value={profile.largeTransactionLimit} onChange={e => setProfile({ ...profile, largeTransactionLimit: Number(e.target.value) })} /></label></div>
    <div className="finance-toggles">{([ ["spendingAlerts", "Spending & budget alerts", "Notify when an incoming expense crosses your limits."], ["renewalReminders", "Subscription renewal reminders", "Show renewals due within seven days of the statement date."], ["voiceAlerts", "Spoken live alerts", "Read new spending alerts aloud while the dashboard is open."] ] as const).map(([key, label, hint]) => <label key={key} className="finance-toggle"><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.checked })} /></label>)}</div>
    {error && <p className="finance-error" role="alert">{displayText(error)}</p>}<button disabled={busy} className="finance-button primary">{busy ? "Saving…" : "Save preferences"}</button>
  </form></FinanceDialog>;
}
