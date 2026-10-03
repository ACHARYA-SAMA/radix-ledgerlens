/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, X } from "lucide-react";
import type { Transaction, VoiceNote, AppState } from "./types/finance";
import { Navigation, ActiveTab } from "./components/Navigation";
import { DashboardView } from "./components/DashboardView";
import { ReviewQueueView } from "./components/ReviewQueueView";
import { DecisionTraceView } from "./components/DecisionTraceView";
import { SharePageView } from "./components/SharePageView";
import { FraudAlertView } from "./components/FraudAlertView";
import { VoiceNoteView } from "./components/VoiceNoteView";
import { VoiceChatView } from "./components/VoiceChatView";
import { InsightsPanel } from "./components/InsightsPanel";
import { AnalyticsView } from "./components/AnalyticsView";
import { sound } from "./utils/audioSynthesizer";
import { api } from "./lib/api";
import { applyTheme, readTheme, type Theme } from "./lib/theme";
import { GoalsView } from "./components/GoalsView.tsx";
import { MobileSenderView } from "./components/MobileSenderView.tsx";
import { ProfilePreferences } from "./components/ProfilePreferences.tsx";
import { PhoneRemote } from "./components/PhoneRemote.tsx";
import { isMobileRoute } from "./lib/publicRoute.ts";
import { displayText } from "../shared/branding.ts";
import { planningAlerts, inr } from "../shared/planning.ts";
import { requestVoiceAudio, playVoiceAudio } from "./lib/voiceAudio.ts";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; title: string; detail: string; severity?: string }[]>([]);
  const stateRef = useRef<AppState | null>(null);
  const requestVersion = useRef(0);
  const refreshRunning = useRef(false);
  const refreshQueued = useRef(false);
  const alertAudio = useRef<AbortController | null>(null);
  const [soundMuted, setSoundMuted] = useState(() => sound.getMuted());
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const toggleTheme = () => setTheme(current => current === "dark" ? "light" : "dark");
  const [selectedTraceTxId, setSelectedTraceTxId] = useState("");
  const publicToken = window.location.pathname.match(/^\/share\/([^/]+)$/)?.[1];
  const mobile = isMobileRoute();
  const acceptState = useCallback((next: AppState) => {
    const previous = stateRef.current;
    stateRef.current = next;
    setState(next);
    if (!previous) return;
    const known = new Set(previous.transactions.map(tx => tx.id));
    const incoming = next.transactions.filter(tx => tx.origin && !known.has(tx.id));
    if (!incoming.length) return;
    sound.playPluck(0.7, 0.25);
    const received = incoming.slice(0, 2).map(tx => ({ id: tx.id, title: "📱 Live Transaction Received", detail: `${displayText(tx.vendorClientName)} · ${inr(tx.amount)} ${tx.type === "credit" ? "received" : "spent"}` }));
    const oldAlerts = new Set(previous.planning && previous.dataDate ? planningAlerts(previous.transactions, previous.planning, previous.dataDate, previous.subscriptions).map(a => a.id) : []);
    const newAlerts = next.planning && next.dataDate ? planningAlerts(next.transactions, next.planning, next.dataDate, next.subscriptions).filter(a => !oldAlerts.has(a.id)) : [];
    setToasts(current => [...current, ...received, ...newAlerts.slice(0, 2)].slice(-4));
    if (next.planning?.profile.voiceAlerts && newAlerts.length && !sound.getMuted()) {
      alertAudio.current?.abort();
      const controller = new AbortController(); alertAudio.current = controller;
      void requestVoiceAudio(displayText(`${newAlerts[0].title}. ${newAlerts[0].detail}`), controller.signal).then(url => playVoiceAudio(url, controller.signal)).catch(() => { /* Visual alerts remain available if speech is unavailable. */ });
    }
  }, []);
  const refresh = useCallback(async () => {
    if (refreshRunning.current) { refreshQueued.current = true; return; }
    refreshRunning.current = true;
    const version = requestVersion.current;
    try {
      const next = await api<AppState>("/state");
      if (version === requestVersion.current) { acceptState(next); setError(""); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      refreshRunning.current = false;
      if (refreshQueued.current) { refreshQueued.current = false; void refresh(); }
    }
  }, [acceptState]);
  useEffect(() => {
    if (publicToken || mobile) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    const stream = new EventSource("/api/live-events");
    stream.addEventListener("ready", () => { setLiveConnected(true); void refresh(); });
    stream.addEventListener("changed", () => void refresh());
    stream.onerror = () => setLiveConnected(false);
    return () => { clearInterval(timer); stream.close(); alertAudio.current?.abort(); };
  }, [refresh, publicToken, mobile]);
  useEffect(() => { if (!toasts.length) return; const timer = setTimeout(() => setToasts(current => current.slice(1)), 10000); return () => clearTimeout(timer); }, [toasts]);
  const mutate = async (path: string, body: unknown) => {
    setError("");
    requestVersion.current++;
    try {
      const result = await api<AppState>(path, body);
      requestVersion.current++;
      acceptState(result);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };
  if (mobile) return <MobileSenderView />;
  if (publicToken) return <div className="ledger-app"><button type="button" onClick={toggleTheme} className="theme-floating-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}</button><SharePageView token={publicToken} /></div>;
  if (!state)
    return (
      <div className="ledger-app min-h-screen bg-black text-white p-12">
        {displayText(error) || "Connecting to LedgerLens…"}
      </div>
    );
  const { transactions, analytics, beneficiaryChanges, voiceNotes } = state;
  const reviewCount = analytics.reviewQueueCount;
  const fraudCount = analytics.fraudAlertsCount;
  const isSyncing = state.sync.running;
  const review = (id: string, action: string, category?: string) =>
    mutate(`/transactions/${id}/review`, { action, category });
  const handleAcceptTransaction = (id: string) => review(id, "accept");
  const handleCorrectCategory = (id: string, category: string) =>
    review(id, "correct", category);
  const handleFlagFraud = (id: string) => review(id, "flag");
  const handleMarkPersonal = (id: string) => review(id, "personal");
  const handleFreezeBeneficiary = (id: string) =>
    mutate(`/alerts/${id}`, { status: "under_review" });
  const handleVerifyPennyDrop = (id: string) =>
    mutate(`/alerts/${id}`, { status: "acknowledged" });
  const handleAddVoiceNote = (note: VoiceNote) => mutate("/voice", note);
  const handleSyncNova = () => {
    void mutate("/sync", {}).catch(() => {});
  };
  const handleSelectTransactionForTrace = (tx: Transaction) => {
    setSelectedTraceTxId(tx.id);
    setActiveTab("decision_trace");
  };
  const handleOpenSharePage = async (id: string) => {
    try {
      const share = await api<{ url: string }>(`/transactions/${id}/share`, {});
      const url = new URL(share.url, window.location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Share link copied: " + url);
      } catch {
        setNotice("Share link: " + url);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="ledger-app min-h-screen bg-[#050608] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(226,232,240,0.12),transparent_70%)] text-slate-100 flex flex-col font-sans selection:bg-white selection:text-black">
      {/* 1-Row 3-Zone Strict Top Bar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        reviewCount={reviewCount}
        fraudCount={fraudCount}
        onSyncNova={handleSyncNova}
        isSyncing={isSyncing}
        theme={theme}
        onToggleTheme={toggleTheme}
        onPhoneRemote={() => setShowPhone(true)}
        onPreferences={() => setShowPreferences(true)}
      />

      <div className="border-b border-white/10 bg-[#0b1014] px-4 py-2 text-[11px] text-slate-400 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2" role="status">
          <span className="inline-flex items-center gap-2 text-slate-300"><span className={`h-1.5 w-1.5 rounded-full ${isSyncing ? "animate-pulse bg-amber-300" : "bg-emerald-300"}`} />{displayText(state.sync.message)}</span>
          <span className="text-[10px]">{liveConnected ? "LIVE CONNECTED" : "LIVE RECONNECTING · POLLING ACTIVE"} · {state.liveTransactionCount ?? 0} live entries</span>
          <span className="font-mono text-[10px]">{state.dataDate ? `STATEMENTS THROUGH ${state.dataDate}` : "NO COMPLETED IMPORT"}</span>
          {!state.configured.gemini && <span className="text-amber-200">Gemini key missing · unresolved items remain in review</span>}
          {state.warnings.length > 0 && (
            <details className="group relative text-amber-200">
              <summary className="cursor-pointer list-none underline decoration-amber-300/35 underline-offset-4">{state.warnings.length} data or model warning{state.warnings.length === 1 ? "" : "s"} <span aria-hidden="true">▾</span></summary>
              <div className="absolute left-0 top-full z-40 mt-2 w-[min(90vw,460px)] rounded-xl border border-amber-300/25 bg-[#151a1e] p-4 text-xs leading-relaxed shadow-2xl">
                {state.warnings.map((w) => <p key={w} className="mt-2 first:mt-0">{displayText(w)}</p>)}
              </div>
            </details>
          )}
          {fraudCount > 0 && activeTab === "dashboard" && (
            <button onClick={() => setActiveTab("fraud_alert")} className="ml-auto inline-flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.07] px-2.5 py-1 text-amber-100 transition-colors hover:bg-amber-300/15 focus-visible:outline-2 focus-visible:outline-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />{fraudCount} risk flags <span aria-hidden="true">↗</span>
            </button>
          )}
          <button type="button" aria-label={soundMuted ? "Unmute interface sounds" : "Mute interface sounds"} title={soundMuted ? "Unmute interface sounds" : "Mute interface sounds"} onClick={() => { const next = !soundMuted; sound.setMuted(next); setSoundMuted(next); }} className="rounded-md border border-white/15 p-1.5 text-slate-300 transition-colors hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
            {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          {(error || state.sync.error) && <span className="text-red-300" role="alert">{displayText(error || state.sync.error || "")}</span>}
          {notice && <span className="break-all text-emerald-300">{notice}</span>}
        </div>
      </div>
      {/* Main Content View with Smooth Kinetic Motion Tab Switching */}
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {activeTab === "goals" && <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{state.dataDate && state.planning ? <GoalsView state={state} onSave={body => mutate("/planning", body)} onPreferences={() => setShowPreferences(true)} /> : <div className="finance-shell finance-page"><h1>Your financial plan starts here.</h1><p>Sync your bank feed to unlock goals, budgets and insights from your statements.</p><button className="finance-button primary" disabled={isSyncing} onClick={handleSyncNova}>{isSyncing ? "Syncing…" : "Sync bank feed"}</button></div>}</motion.div>}
          {/* SCREEN 1: MAIN DASHBOARD with 50/50 Bipartite Fluid Horizon & Optical Inversion */}
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col w-full"
            >
              {/* Live statement overview leads immediately into the ledger. */}
              <InsightsPanel analytics={analytics} insights={state.insights} />
              <DashboardView
                transactions={transactions}
                onSelectTransactionForTrace={handleSelectTransactionForTrace}
                onOpenSharePage={handleOpenSharePage}
                onTriggerPluck={(ratio) => sound.playPluck(ratio, 0.4)}
              />
            </motion.div>
          )}

          {activeTab === "analytics" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              <AnalyticsView
                transactions={transactions}
                bankAccounts={state.bankAccounts}
                subscriptions={state.subscriptions}
                beneficiaryChanges={beneficiaryChanges}
                analytics={analytics}
                onSelectTransactionForTrace={handleSelectTransactionForTrace}
              />
            </motion.div>
          )}

          {/* SCREEN 2: REVIEW QUEUE (Kinetic Card Drag & Flick Physics) */}
          {activeTab === "review_queue" && (
            <motion.div
              key="review_queue"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <ReviewQueueView
                transactions={transactions}
                onAcceptTransaction={handleAcceptTransaction}
                onCorrectCategory={handleCorrectCategory}
                onFlagFraud={handleFlagFraud}
                onMarkPersonal={handleMarkPersonal}
              />
            </motion.div>
          )}

          {/* SCREEN 3: LIVE DECISION TRACE (Hero 3D Node Pipeline) */}
          {activeTab === "decision_trace" && (
            <motion.div
              key="decision_trace"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <DecisionTraceView
                transactions={transactions}
                initialTransactionId={selectedTraceTxId}
              />
            </motion.div>
          )}

          {/* SCREEN 5: FRAUD ALERT PANEL */}
          {activeTab === "fraud_alert" && (
            <motion.div
              key="fraud_alert"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <FraudAlertView
                beneficiaryChanges={beneficiaryChanges}
                transactions={transactions}
                onFreezeBeneficiary={handleFreezeBeneficiary}
                onVerifyPennyDrop={handleVerifyPennyDrop}
              />
            </motion.div>
          )}

          {/* SCREEN 6: VOICE-NOTE INTAKE */}
          {activeTab === "voice_intake" && (
            <motion.div
              key="voice_intake"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <VoiceNoteView
                voiceNotes={voiceNotes}
                onAddVoiceNote={handleAddVoiceNote}
                transactions={transactions}
                onMatch={(id, transactionId) =>
                  mutate(`/voice/${id}/match`, { transactionId })
                }
              />
            </motion.div>
          )}

          {/* SCREEN 7: CALL-AND-ASK VOICE CHAT */}
          {activeTab === "voice_chat" && (
            <motion.div
              key="voice_chat"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <VoiceChatView
                transactions={transactions}
                analytics={analytics}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {showPreferences && state.planning && <ProfilePreferences plan={state.planning} onSave={body => mutate("/planning", body)} onClose={() => setShowPreferences(false)} />}
      {showPhone && <PhoneRemote onClose={() => setShowPhone(false)} />}
      <div className="finance-toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(toast => <div className={`finance-toast ${toast.severity ?? ""}`} key={toast.id} role="status"><div><strong>{toast.title}</strong><p>{displayText(toast.detail)}</p></div><button onClick={() => setToasts(current => current.filter(t => t.id !== toast.id))} aria-label="Dismiss notification"><X size={15} /></button></div>)}</div>
    </div>
  );
}
