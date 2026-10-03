/* Repository touch marker. */
import { useState } from "react";
import { Bell, SlidersHorizontal, Target, Moon, Wallet, Check } from "lucide-react";
import { displayText } from "../../shared/branding.ts";
import { inr, preferenceDefaults, type PlanningState } from "../../shared/planning.ts";
import { FinanceDialog } from "./FinanceDialog.tsx";

export function ProfilePreferences({ plan, onSave, onClose }: { plan: PlanningState; onSave: (body: unknown) => Promise<void>; onClose: () => void }) {
  const [profile, setProfile] = useState({ ...preferenceDefaults, ...plan.profile });
  const [revision] = useState(plan.revision);
  const [tab, setTab] = useState("plan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (key: "spendingAlerts" | "renewalReminders" | "voiceAlerts" | "liveNotifications" | "quietHoursEnabled", title: string, hint: string) => <label className="preference-switch"><span><strong>{title}</strong><small>{hint}</small></span><input type="checkbox" role="switch" checked={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.checked })} /></label>;
  return <FinanceDialog className="preferences-dialog" title="Profile & alert preferences" onClose={onClose}>
    <div className="preferences-intro"><span className="preferences-avatar">{profile.name.trim().slice(0, 1).toUpperCase() || "M"}</span><div><span className="finance-eyebrow">YOUR PERSONAL MONEY SETTINGS</span><h3>A plan that feels like you.</h3><p>One saved profile for your dashboard, goals, alerts and voice assistant.</p></div></div>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await onSave({ action: "profile", revision, profile }); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      <div className="preferences-tabs" aria-label="Preference sections">{[{ id: "plan", title: "My plan", icon: Wallet }, { id: "alerts", title: "Notifications", icon: Bell }, { id: "experience", title: "Experience", icon: SlidersHorizontal }].map(({ id, title, icon: Icon }) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><Icon size={16} />{title}</button>)}</div>
      <div className="preferences-content">
        {tab === "plan" && <><div className="preference-section-heading"><Target size={20} /><div><h3>Give your money a direction</h3><p>Targets shape your daily allowance and goal recommendations.</p></div></div>
          <label>Profile name<input required maxLength={60} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label>
          <div className="finance-form-grid"><label>Monthly income target (₹)<input type="number" min="0.01" step="0.01" required value={profile.monthlyIncomeTarget} onChange={e => setProfile({ ...profile, monthlyIncomeTarget: Number(e.target.value) })} /></label><label>Savings target (%)<input type="number" min="0" max="100" step="0.1" required value={profile.savingsTargetPct} onChange={e => setProfile({ ...profile, savingsTargetPct: Number(e.target.value) })} /></label></div>
          <div className="preference-preview"><span>YOUR MONTHLY SAVINGS INTENTION</span><strong>{inr(profile.monthlyIncomeTarget * profile.savingsTargetPct / 100)}</strong><small>Safe-to-spend still uses actual received income.</small></div>
          <label>Priority savings goal<select value={profile.priorityGoalId} onChange={e => setProfile({ ...profile, priorityGoalId: e.target.value })}><option value="">First active goal</option>{plan.goals.map(g => <option key={g.id} value={g.id}>{displayText(g.name)}</option>)}</select><small>Receives the first projected savings and Smart Micro-Sweep suggestion.</small></label>
          <label>Daily advisory spend limit (₹)<input type="number" min="0" step="0.01" placeholder="No extra limit" value={profile.dailySpendLimit ?? ""} onChange={e => setProfile({ ...profile, dailySpendLimit: e.target.value === "" ? null : Number(e.target.value) })} /><small>Optional. Caps safe-to-spend and adds a daily-limit alert. Does not block payments.</small></label>
        </>}
        {tab === "alerts" && <><div className="preference-section-heading"><Bell size={20} /><div><h3>A heads-up at the right time</h3><p>Control which notifications arrive as your ledger changes.</p></div></div>
          {toggle("spendingAlerts", "Spending & budget alerts", "Budget crossings, large expenses and your daily limit.")}
          <fieldset className="threshold-fieldset" disabled={!profile.spendingAlerts}><legend>Notify me at these budget levels</legend><div className="threshold-chips">{[...new Set([50, 75, 80, 90, 100, ...profile.alertThresholds])].sort((a, b) => a - b).map(value => <button type="button" aria-pressed={profile.alertThresholds.includes(value)} key={value} onClick={() => setProfile({ ...profile, alertThresholds: profile.alertThresholds.includes(value) ? profile.alertThresholds.filter(v => v !== value) : [...profile.alertThresholds, value].sort((a, b) => a - b) })}>{profile.alertThresholds.includes(value) && <Check size={12} />}{value}%</button>)}</div><small>Choose one to five thresholds.</small></fieldset>
          <label>Large expense alert (₹)<input type="number" min="0.01" step="0.01" required value={profile.largeTransactionLimit} onChange={e => setProfile({ ...profile, largeTransactionLimit: Number(e.target.value) })} /></label>
          {toggle("renewalReminders", "Subscription renewals", "Show upcoming bills based on your statement date.")}
          <label>Renewal notice window<select disabled={!profile.renewalReminders} value={profile.renewalLeadDays} onChange={e => setProfile({ ...profile, renewalLeadDays: Number(e.target.value) })}>{[...new Set([3, 7, 14, 30, profile.renewalLeadDays])].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n} days ahead</option>)}</select></label>
          {toggle("liveNotifications", "Live transaction notifications", "Show receipt toasts when phone or webhook entries arrive.")}
        </>}
        {tab === "experience" && <><div className="preference-section-heading"><Moon size={20} /><div><h3>Make space for focus</h3><p>Your preferred view and notification rhythm, saved across sessions.</p></div></div>
          <label>Default Spend Mix view<select value={profile.defaultSpendPeriod} onChange={e => setProfile({ ...profile, defaultSpendPeriod: e.target.value as typeof profile.defaultSpendPeriod })}><option value="weekly">Weekly · last 7 days</option><option value="monthly">Monthly · month to date</option><option value="yearly">Yearly · year to date</option></select><small>Updates the chart on the first page as soon as you save.</small></label>
          {toggle("voiceAlerts", "Spoken live alerts", "Read new budget alerts aloud. The app’s mute control also applies.")}
          {toggle("quietHoursEnabled", "Quiet hours", "Pause live toasts and alert sounds. Your Goals & Budgets alert list stays available.")}
          <div className="finance-form-grid"><label>Quiet hours start<input type="time" disabled={!profile.quietHoursEnabled} value={profile.quietHoursStart} onChange={e => setProfile({ ...profile, quietHoursStart: e.target.value })} /></label><label>Quiet hours end<input type="time" disabled={!profile.quietHoursEnabled} value={profile.quietHoursEnd} onChange={e => setProfile({ ...profile, quietHoursEnd: e.target.value })} /></label></div><p className="finance-hint">Times use India Standard Time. Matching start and end times disable the quiet interval.</p>
        </>}
      </div>
      {error && <p className="finance-error" role="alert">{displayText(error)}</p>}
      <footer className="preferences-footer"><span>Applies across LedgerLens</span><div className="finance-actions"><button type="button" className="finance-button" onClick={onClose}>Cancel</button><button disabled={busy} className="finance-button primary">{busy ? "Saving…" : "Save preferences"}</button></div></footer>
    </form>
  </FinanceDialog>;
}
