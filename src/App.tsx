/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [soundMuted, setSoundMuted] = useState(() => sound.getMuted());
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const toggleTheme = () => setTheme(current => current === "dark" ? "light" : "dark");
  const [selectedTraceTxId, setSelectedTraceTxId] = useState("");
  const publicToken = window.location.pathname.match(/^\/share\/([^/]+)$/)?.[1];
  const refresh = useCallback(async () => {
    try {
      setState(await api<AppState>("/state"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (publicToken) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh, publicToken]);
  const mutate = async (path: string, body: unknown) => {
    setError("");
    try {
      const result = await api<AppState>(path, body);
      setState(result);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };
  if (publicToken) return <div className="ledger-app"><button type="button" onClick={toggleTheme} className="theme-floating-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}</button><SharePageView token={publicToken} /></div>;
  if (!state)
    return (
      <div className="ledger-app min-h-screen bg-black text-white p-12">
        {error || "Connecting to LedgerLens…"}
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
      />

      <div className="border-b border-white/10 bg-[#0b1014] px-4 py-2 text-[11px] text-slate-400 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2" role="status">
          <span className="inline-flex items-center gap-2 text-slate-300"><span className={`h-1.5 w-1.5 rounded-full ${isSyncing ? "animate-pulse bg-amber-300" : "bg-emerald-300"}`} />{state.sync.message}</span>
          <span className="font-mono text-[10px]">{state.dataDate ? `STATEMENTS THROUGH ${state.dataDate}` : "NO COMPLETED IMPORT"}</span>
          {!state.configured.gemini && <span className="text-amber-200">Gemini key missing · unresolved items remain in review</span>}
          {state.warnings.length > 0 && (
            <details className="group relative text-amber-200">
              <summary className="cursor-pointer list-none underline decoration-amber-300/35 underline-offset-4">{state.warnings.length} data or model warning{state.warnings.length === 1 ? "" : "s"} <span aria-hidden="true">▾</span></summary>
              <div className="absolute left-0 top-full z-40 mt-2 w-[min(90vw,460px)] rounded-xl border border-amber-300/25 bg-[#151a1e] p-4 text-xs leading-relaxed shadow-2xl">
                {state.warnings.map((w) => <p key={w} className="mt-2 first:mt-0">{w}</p>)}
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
          {(error || state.sync.error) && <span className="text-red-300" role="alert">{error || state.sync.error}</span>}
          {notice && <span className="break-all text-emerald-300">{notice}</span>}
        </div>
      </div>
      {/* Main Content View with Smooth Kinetic Motion Tab Switching */}
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
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
    </div>
  );
}
