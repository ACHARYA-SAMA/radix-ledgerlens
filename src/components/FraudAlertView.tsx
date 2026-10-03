/* Repository touch marker. */
import { displayText } from "../../shared/branding.ts";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BeneficiaryChange, Transaction } from "../types/finance";
import { formatINR } from "../utils/formatters";
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  RefreshCw,
  CheckCircle2,
  Clock,
  Building,
  Flame,
} from "lucide-react";
import { sound } from "../utils/audioSynthesizer";
import { AirBubbleBox } from "./AirBubbleBox";

interface FraudAlertViewProps {
  beneficiaryChanges: BeneficiaryChange[];
  transactions: Transaction[];
  onFreezeBeneficiary: (id: string) => void;
  onVerifyPennyDrop: (id: string) => void;
}

export const FraudAlertView: React.FC<FraudAlertViewProps> = ({
  beneficiaryChanges,
  onFreezeBeneficiary,
  onVerifyPennyDrop,
}) => {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const pendingRiskChanges = beneficiaryChanges.filter(
    (b) =>
      b.activeStatus === "frozen" ||
      b.activeStatus === "under_review" ||
      b.daysAgo <= 7,
  );

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await onVerifyPennyDrop(id);
      setActionNotice(
        "Alert acknowledged in LedgerLens. Account Aggregator (AA) Bank Sync verification status is unchanged.",
      );
    } catch (e) {
      setActionNotice((e as Error).message);
    } finally {
      setVerifyingId(null);
    }
  };
  const handleFreeze = async (id: string, name: string) => {
    try {
      await onFreezeBeneficiary(id);
      setActionNotice(
        `${name} marked for local review. No payment was stopped.`,
      );
    } catch (e) {
      setActionNotice((e as Error).message);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-black text-slate-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-5xl space-y-6">
        {/* Radix Sentinel Alert Cockpit Banner */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden p-6 sm:p-8 bg-zinc-900/80 border border-white/25 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_8px_32px_0_rgba(0,0,0,0.8)]"
        >
          {/* Animated Liquid Silver Scanning Laser Line */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-white to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
          />

          <div className="flex items-start gap-4 z-10">
            <div className="p-3.5 bg-zinc-800/90 text-white rounded-2xl border border-white/30 backdrop-blur-xl shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-white tracking-tight uppercase font-mono">
                  BENEFICIARY TAMPERING & PAYOUT SENTINEL
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black tracking-widest shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                  SURVEILLANCE ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Review payments made shortly after beneficiary details changed.
                Alerts are local review records; Account Aggregator (AA) Bank Sync remains read-only.
              </p>
            </div>
          </div>

          <AirBubbleBox className="text-right shrink-0 z-10 p-4 sm:p-5 rounded-2xl backdrop-blur-xl">
            {(isHov) => (
              <>
                <div
                  className={`text-[10px] font-mono uppercase tracking-widest transition-colors ${isHov ? "text-black font-bold" : "text-slate-400"}`}
                >
                  High-Risk Remittances:
                </div>
                {/* Glossy Silver Metallic Amount */}
                <div
                  className={`text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums mt-0.5 transition-all ${isHov ? "text-black" : "bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]"}`}
                >
                  {formatINR(
                    pendingRiskChanges.reduce(
                      (acc, curr) =>
                        acc + Math.round(curr.scheduledPayoutsTotal * 100),
                      0,
                    ) / 100,
                  )}
                </div>
              </>
            )}
          </AirBubbleBox>
        </motion.div>

        {/* Action Notice feedback */}
        <AnimatePresence>
          {actionNotice && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2.5 px-4 py-3 bg-zinc-900/90 border border-white/30 rounded-2xl text-xs font-mono text-white backdrop-blur-xl shadow-xl"
            >
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
              <span>{displayText(actionNotice)}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Beneficiary Risk Cards with Glassmorphism */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/15 pb-2">
            <span className="text-xs font-bold text-white font-mono tracking-wider">
              HIGH-PRIORITY TAMPERING MONITOR ({pendingRiskChanges.length})
            </span>
            <span className="text-xs font-mono text-slate-400">
              Change-to-payment window: configurable · default 7 days
            </span>
          </div>

          {pendingRiskChanges.map((ben) => {
            const isFrozen = ben.activeStatus === "under_review";

            return (
              <motion.div
                key={ben.id}
                onMouseEnter={() => {
                  setHoveredCardId(ben.id);
                  sound.playPluck(0.4, 0.2);
                }}
                onMouseLeave={() => setHoveredCardId(null)}
                whileHover={{ y: -3, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={`relative p-6 sm:p-7 rounded-3xl border transition-all overflow-hidden backdrop-blur-2xl ${
                  isFrozen
                    ? "bg-zinc-900/80 border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.15)]"
                    : "bg-zinc-900/60 border-white/20 hover:border-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
                }`}
              >
                {/* Top Row: Vendor & Alteration metadata */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/15">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-white/20 text-slate-200">
                      <Building className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-base flex items-center gap-2 font-sans">
                        <span>{displayText(ben.vendorName)}</span>
                        <span className="text-[11px] font-mono text-slate-400 font-normal">
                          GSTIN: {ben.gstin}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-400">
                      Payment after change:
                    </span>
                    <span className="text-slate-200 font-bold px-2 py-0.5 rounded-full bg-zinc-800/80 border border-white/20">
                      {ben.daysAgo} days
                    </span>
                    <span>·</span>
                    <span className="text-slate-400">Operator:</span>
                    <span className="text-slate-200">{displayText(ben.changedBy)}</span>
                  </div>
                </div>

                {/* Middle Row: Bank Account Diff & Penny Drop Status with White Fill Reaction */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 text-xs font-mono">
                  {/* Previous Account */}
                  <AirBubbleBox className="p-4 rounded-2xl backdrop-blur-xl">
                    {(isHov) => (
                      <>
                        <div
                          className={`uppercase text-[10px] transition-colors ${isHov ? "text-black font-bold" : "text-slate-500"}`}
                        >
                          Previous Registered Account
                        </div>
                        <div
                          className={`font-bold mt-1 line-through transition-colors ${isHov ? "text-slate-700" : "text-slate-400"}`}
                        >
                          {ben.oldAccount}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 transition-colors ${isHov ? "text-slate-600 font-medium" : "text-slate-500"}`}
                        >
                          IFSC: {ben.oldIfsc}
                        </div>
                      </>
                    )}
                  </AirBubbleBox>

                  {/* New Account */}
                  <AirBubbleBox className="p-4 rounded-2xl backdrop-blur-xl">
                    {(isHov) => (
                      <>
                        <div
                          className={`uppercase text-[10px] font-bold flex items-center gap-1 transition-colors ${isHov ? "text-black" : "text-white"}`}
                        >
                          <Flame className="w-3 h-3 text-slate-300" />
                          <span>New Target Beneficiary</span>
                        </div>
                        <div
                          className={`font-bold mt-1 text-sm transition-colors ${isHov ? "text-black" : "text-white"}`}
                        >
                          {ben.newAccount}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 transition-colors ${isHov ? "text-slate-700 font-semibold" : "text-slate-300"}`}
                        >
                          IFSC: {ben.newIfsc}
                        </div>
                      </>
                    )}
                  </AirBubbleBox>

                  {/* Penny Drop & Cooling Off */}
                  <AirBubbleBox className="p-4 rounded-2xl space-y-1.5 backdrop-blur-xl">
                    {(isHov) => (
                      <>
                        <div className="flex items-center justify-between text-[11px]">
                          <span
                            className={`uppercase transition-colors ${isHov ? "text-slate-800 font-semibold" : "text-slate-400"}`}
                          >
                            Account Aggregator (AA) Bank Sync verification:
                          </span>
                          <span
                            className={`font-bold uppercase ${
                              ben.pennyDropStatus === "name_mismatch"
                                ? "text-red-500 underline"
                                : isHov
                                  ? "text-black"
                                  : "text-slate-200"
                            }`}
                          >
                            {ben.sourceVerified === true
                              ? "Verified"
                              : ben.sourceVerified === false
                                ? "Unverified"
                                : "Unknown"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span
                            className={`uppercase transition-colors ${isHov ? "text-slate-800 font-semibold" : "text-slate-400"}`}
                          >
                            Local review:
                          </span>
                          <span
                            className={`font-bold transition-colors ${isHov ? "text-black" : "text-slate-200"}`}
                          >
                            {ben.activeStatus.replaceAll("_", " ")}
                          </span>
                        </div>

                        <div
                          className={`flex items-center justify-between text-[11px] pt-1 border-t ${isHov ? "border-slate-200" : "border-white/15"}`}
                        >
                          <span
                            className={`uppercase transition-colors ${isHov ? "text-slate-800 font-semibold" : "text-slate-400"}`}
                          >
                            Successful payments:
                          </span>
                          <span
                            className={`font-bold transition-colors ${isHov ? "text-black font-black" : "text-white"}`}
                          >
                            {formatINR(ben.scheduledPayoutsTotal)}
                          </span>
                        </div>
                      </>
                    )}
                  </AirBubbleBox>
                </div>

                <p className="text-xs text-amber-200 mb-4">{displayText(ben.reason)}</p>
                {/* Bottom Row: Clear Action Triggers */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/15">
                  <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                    {isFrozen ? (
                      <span className="text-red-400 flex items-center gap-1 font-bold">
                        <Lock className="w-3.5 h-3.5" />
                        <span>REVIEW BEFORE FURTHER PROCESSING</span>
                      </span>
                    ) : (
                      <span className="text-slate-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Active Monitoring by LedgerLens Sentinel</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleVerify(ben.id)}
                      disabled={verifyingId === ben.id}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-900/80 hover:bg-white hover:text-black hover:border-white text-slate-200 rounded-xl border border-white/25 transition-all duration-200 disabled:opacity-40 cursor-pointer backdrop-blur-xl group hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-slate-300 group-hover:text-black transition-colors ${verifyingId === ben.id ? "animate-spin" : ""}`}
                      />
                      <span>
                        {verifyingId === ben.id
                          ? "Saving..."
                          : "Acknowledge alert"}
                      </span>
                    </motion.button>

                    {!isFrozen && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleFreeze(ben.id, ben.vendorName)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-white hover:text-black hover:border-white text-white rounded-xl transition-all duration-200 shadow-lg cursor-pointer group hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
                      >
                        <Lock className="w-3.5 h-3.5 group-hover:text-black transition-colors" />
                        <span>Mark for review</span>
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
