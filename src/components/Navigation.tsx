import React from "react";
import { motion } from "motion/react";
import { Play, RefreshCw, AlertTriangle, Zap, LogOut, Moon, Sun, Smartphone, Settings2 } from "lucide-react";
import type { Theme } from "../lib/theme";
import { sound } from "../utils/audioSynthesizer";
import { supabase } from "../lib/supabase";

export type ActiveTab =
  | "dashboard"
  | "analytics"
  | "goals"
  | "review_queue"
  | "decision_trace"
  | "fraud_alert"
  | "voice_intake"
  | "voice_chat"
  | "share_page";

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  reviewCount: number;
  fraudCount: number;
  onSyncNova: () => void;
  isSyncing: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onPhoneRemote: () => void;
  onPreferences: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  reviewCount,
  fraudCount,
  onSyncNova,
  isSyncing,
  theme,
  onToggleTheme,
  onPhoneRemote,
  onPreferences,
}) => {
  const navItems = [
    { id: "dashboard" as const, label: "Ledger Stream" },
    { id: "analytics" as const, label: "Analytics" },
    { id: "goals" as const, label: "Goals & Budgets" },
    { id: "review_queue" as const, label: "Review Queue", badge: reviewCount },
    { id: "decision_trace" as const, label: "Decision Trace", isHero: true },
    {
      id: "fraud_alert" as const,
      label: "Fraud Sentinel",
      badge: fraudCount,
      isAlert: true,
    },
    { id: "voice_intake" as const, label: "Voice Intake" },
    { id: "voice_chat" as const, label: "Voice Assistant" },
  ];

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-white/15 bg-zinc-950/90 px-4 py-2.5 shadow-[0_4px_30px_rgba(0,0,0,0.7)] backdrop-blur-2xl 2xl:flex-nowrap">
      {/* Zone 1: Radix LedgerLens Brand with Glossy Liquid Silver Sheen */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          setActiveTab("dashboard");
          sound.playPluck(0.2, 0.4);
        }}
        className="flex items-center gap-3 text-left group cursor-pointer"
      >
        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-white/30 via-slate-400/10 to-transparent border border-white/35 flex items-center justify-center backdrop-blur-md shadow-[0_0_18px_rgba(255,255,255,0.2)] group-hover:border-white transition-colors">
          <Zap className="w-4 h-4 text-white" />
          <div className="absolute inset-0 rounded-lg bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div>
          <div className="font-black text-base tracking-tight font-sans">
            <span className="bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              LedgerLens
            </span>
          </div>
        </div>
      </motion.button>

      {/* Zone 2: Glassmorphism Nav Links with Silver Chrome Active Indicator */}
      <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/15 bg-zinc-900/60 p-1 shadow-inner backdrop-blur-xl 2xl:order-none 2xl:min-w-0 2xl:flex-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                sound.playPluck(isActive ? 0.3 : 0.6, 0.35);
              }}
              className="relative flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-xs tracking-wide transition-all"
            >
              {/* Glossy Silver Active Pill */}
              {isActive && (
                <motion.div
                  layoutId="activeNavPill"
                  className="absolute inset-0 rounded-lg bg-white/15 border border-white/40 backdrop-blur-xl shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              )}

              <span
                className={`relative z-10 flex items-center gap-1.5 transition-colors duration-200 ${
                  isActive
                    ? "text-white font-bold"
                    : "rounded-md text-slate-400 hover:bg-white hover:text-black"
                }`}
              >
                {item.isHero && <Play className="w-3 h-3 fill-current" />}
                {item.isAlert && <AlertTriangle className="w-3 h-3" />}
                <span>{item.label}</span>

                {item.badge !== undefined && item.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-mono font-bold text-black rounded-full bg-white border border-slate-300 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                  >
                    {item.badge}
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Glossy Liquid Silver Button with White Hover Fill */}
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onPhoneRemote} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-300 border border-white/20" title="Phone remote"><Smartphone size={14} /><span className="hidden sm:inline">Phone Remote</span></button>
        <button type="button" onClick={onPreferences} className="p-2 rounded-lg text-slate-300 border border-white/20" aria-label="Profile and alert preferences"><Settings2 size={14} /></button>
        <button type="button" role="switch" aria-checked={theme === "light"} aria-label="Light mode" title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={onToggleTheme} className="theme-toggle" >
          <span className="theme-toggle-icon">{theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}</span>
          <span className="hidden sm:inline">{theme === "dark" ? "Dark" : "Light"}</span>
          <span className="theme-toggle-track" aria-hidden="true"><span className="theme-toggle-thumb" /></span>
        </button>
        <button type="button" onClick={() => void supabase?.auth.signOut()} title="Sign out" aria-label="Sign out" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-white/20 hover:text-white hover:border-white/40"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            onSyncNova();
            sound.playChirp(700);
          }}
          disabled={isSyncing}
          className="relative group overflow-hidden flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono font-bold text-white bg-zinc-900/70 border border-white/25 hover:bg-white hover:border-white hover:text-black rounded-lg backdrop-blur-xl transition-all duration-200 shadow-[0_0_15px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.35)] cursor-pointer disabled:opacity-40"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-slate-300 group-hover:text-black transition-colors ${
              isSyncing
                ? "animate-spin"
                : "group-hover:rotate-180 transition-transform duration-500"
            }`}
          />
          <span className="bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent group-hover:text-black group-hover:bg-none transition-colors">
            {isSyncing ? "SYNCING..." : "SYNC BANK FEED"}
          </span>
        </motion.button>
      </div>
    </header>
  );
};
