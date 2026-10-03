import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, Send, Smartphone, Wifi, Utensils, BriefcaseBusiness, Laptop, ShoppingBag, Target } from "lucide-react";
import { CATEGORIES, type Category } from "../../shared/categories.ts";
import { BANK_SYNC_LABEL, displayText } from "../../shared/branding.ts";
import { inr } from "../../shared/planning.ts";

type Config = { ready: boolean; date: string; accounts: { id: string; label: string }[] };
type Draft = { merchant: string; amount: number; direction: "debit" | "credit"; category: Category; rail: string; goalId?: string };
const presets: (Draft & { label: string; icon: typeof Target })[] = [
  { label: "Dining & food", merchant: "The Lunch Room", amount: 850, direction: "debit", category: "other_expense", rail: "UPI", icon: Utensils },
  { label: "Salary received", merchant: "Monthly salary", amount: 150000, direction: "credit", category: "other_income", rail: "NEFT", icon: BriefcaseBusiness },
  { label: "Subscription", merchant: "Cloud workspace", amount: 1499, direction: "debit", category: "software", rail: "UPI", icon: Laptop },
  { label: "Impulse shopping", merchant: "Weekend shopping", amount: 45000, direction: "debit", category: "personal", rail: "UPI", icon: ShoppingBag },
  { label: "Goal contribution", merchant: "Emergency reserve", amount: 2500, direction: "debit", category: "internal_transfer", rail: "IMPS", goalId: "emergency", icon: Target },
];

async function publicApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(displayText(result.error ?? "Could not reach the live ledger."));
  return result;
}

export function MobileSenderView() {
  const [config, setConfig] = useState<Config | null>(null);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState("");
  const [draft, setDraft] = useState<Draft>({ merchant: "", amount: 850, direction: "debit", category: "other_expense", rail: "UPI" });
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; merchant: string; amount: number; duplicate: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const load = async () => {
    try {
      const value = await publicApi<Config>("live-config");
      setConfig(value); setAccountId(current => value.accounts.some(a => a.id === current) ? current : value.accounts[0]?.id ?? ""); setDate(current => current || value.date); setError("");
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);
  const send = async (value: Draft) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setReceipt(null);
    const payload = { merchant: value.merchant, amount: value.amount, direction: value.direction, category: value.category, rail: value.rail, goalId: value.goalId, accountId, date };
    const signature = JSON.stringify(payload);
    if (retry.current?.payload !== signature) retry.current = { payload: signature, id: crypto.randomUUID() };
    try {
      const result = await publicApi<{ id: string; merchant: string; amount: number; duplicate: boolean }>("live-transaction", { ...payload, requestId: retry.current.id });
      setReceipt(result); retry.current = null;
    } catch (e) { setError(`${(e as Error).message} You can retry safely.`); }
    finally { locked.current = false; setBusy(false); }
  };
  const disabled = busy || !config?.ready || !accountId;
  return <div className="ledger-app finance-shell mobile-sender">
    <div className="sender-top"><span className="finance-brand"><span className="finance-brand-mark">L</span> LedgerLens</span><span className="finance-tag"><Smartphone size={13} /> Phone remote</span></div>
    <header className="sender-hero"><div className="finance-eyebrow"><span className={`live-dot ${config?.ready ? "" : "offline"}`} /> {config?.ready ? "CONNECTED TO LIVE LEDGER" : "WAITING FOR BANK SYNC"}</div><h1>Your phone.<br /><span>A live financial story.</span></h1><p>Send a demo transaction and see your laptop update in real time.</p></header>
    <div className="finance-card sender-status"><Wifi size={19} /><div><strong>{BANK_SYNC_LABEL}</strong><p>Demo entries join your ledger. No money moves.</p></div></div>
    {error && <div role="alert" className="finance-alert critical">{displayText(error)}</div>}
    {receipt && <div role="status" className="sender-receipt"><CheckCircle2 size={23} /><div><strong>{receipt.duplicate ? "Already delivered — no duplicate created" : "Delivered to your live dashboard"}</strong><p>{displayText(receipt.merchant)} · {inr(receipt.amount)}</p></div></div>}
    {!config?.ready && <div className="finance-card"><p>Sync the bank feed on your signed-in laptop, then reconnect here.</p><button className="finance-button" onClick={() => void load()}>Reconnect</button></div>}
    <section className="finance-card"><div className="finance-section-title"><h2>Destination</h2><span className="finance-tag">Same ledger, instantly</span></div><div className="finance-form-grid"><label>Bank account<select value={accountId} onChange={e => setAccountId(e.target.value)} disabled={busy}>{config?.accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label><label>Statement date<input type="date" required value={date} onChange={e => setDate(e.target.value)} disabled={busy} /></label></div><p className="finance-hint">Defaults to the latest imported statement date so charts update in the active period.</p></section>
    <section><div className="finance-section-title"><h2>One tap. Watch it happen.</h2><span className="finance-eyebrow">QUICK SEND</span></div><div className="sender-presets">{presets.map(({ icon: Icon, label, ...value }) => <button key={label} disabled={disabled} onClick={() => void send(value)} className={`sender-preset ${value.direction === "credit" ? "income" : ""}`}><Icon size={20} /><strong>{label}</strong><span>{value.direction === "credit" ? "+" : "−"}{inr(value.amount)}</span><ArrowUpRight size={15} /></button>)}</div></section>
    <form className="finance-card" onSubmit={e => { e.preventDefault(); void send(draft); }}><div className="finance-section-title"><h2>Make it your own</h2><span className="finance-eyebrow">CUSTOM TRANSACTION</span></div><label>Merchant / counterparty<input value={draft.merchant} required maxLength={120} placeholder="e.g. Corner coffee" onChange={e => setDraft({ ...draft, merchant: e.target.value })} /></label><div className="finance-form-grid"><label>Amount (₹)<input type="number" min="0.01" max="1000000000" step="0.01" required value={draft.amount} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} /></label><label>Direction<select value={draft.direction} onChange={e => setDraft({ ...draft, direction: e.target.value as Draft["direction"] })}><option value="debit">Expense debit</option><option value="credit">Income credit</option></select></label><label>Payment rail<select value={draft.rail} onChange={e => setDraft({ ...draft, rail: e.target.value })}>{["UPI", "NEFT", "IMPS", "RTGS", "CARD", "CASH"].map(rail => <option key={rail}>{rail}</option>)}</select></label><label>Category<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as Category })}>{Object.entries(CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div><button disabled={disabled} className="finance-button primary sender-submit"><Send size={17} />{busy ? "Delivering…" : "Send to live ledger"}</button></form>
    <footer className="sender-footer">LedgerLens · Personal Financial Intelligence<br />Demo sender · use on your configured HTTPS app URL</footer>
  </div>;
}
