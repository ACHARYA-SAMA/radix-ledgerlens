import { displayText } from "../../shared/branding.ts";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
  TraceScenario,
  ArchitectureNode,
} from "../data/architectureTreeData";
import { formatINR } from "../utils/formatters";
import {
  GitFork,
  Cpu,
  Database,
  Building2,
  ShieldAlert,
  Layers,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Terminal,
  Code,
  FileCheck,
  Check,
  FileText,
  Lock,
  ChevronRight,
  Sliders,
} from "lucide-react";
import { sound } from "../utils/audioSynthesizer";
import { Transaction } from "../types/finance";
import { AirBubbleBox } from "./AirBubbleBox";
import { authHeaders } from "../lib/supabase";
import { streamTrace } from "../lib/traceStream";

interface DecisionTraceViewProps {
  transactions?: Transaction[];
  initialTransactionId?: string;
}

const TraceGraph: React.FC<DecisionTraceViewProps> = ({
  transactions = [],
  initialTransactionId,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    initialTransactionId || transactions[0].id,
  );
  const tx =
    transactions.find((t) => t.id === selectedScenarioId) || transactions[0];
  const signature = JSON.stringify(tx.trace);
  const scenario = useMemo<TraceScenario>(() => {
    const events = tx.trace?.length
      ? tx.trace
      : [
          {
            stage: "Awaiting trace",
            status: "skipped" as const,
            reason: "No recorded processing events.",
          },
        ];
    const nodes: Record<string, ArchitectureNode> = {};
    events.forEach((e, i) => {
      const id = `step_${i}${e.status === "warning" ? "_fraud" : ""}`;
      nodes[id] = {
        id,
        label: e.stage,
        type:
          e.status === "warning"
            ? "sentinel_anomaly"
            : e.stage.includes("Gemini")
              ? "llm_reasoning"
              : i === 0
                ? "ingestion"
                : i === events.length - 1
                  ? "ledger_output"
                  : "decision_gate",
        systemName: "LedgerLens processing record",
        status: e.status === "warning" ? "diverged" : e.status,
        metrics: {
          latencyMs: 0,
          confidenceScore: e.confidence,
          decisionCriteria: e.source,
        },
        humanExplanation: e.reason,
        deepInspection: {
          inputTensorOrPayload: JSON.stringify(
            { transactionId: tx.id, narration: tx.rawNarration },
            null,
            2,
          ),
          internalLogic: e.reason,
          outputResult: JSON.stringify(e, null, 2),
        },
      };
    });
    return {
      id: tx.id,
      title: tx.vendorClientName,
      subtitle: "Replay of saved processing events",
      badge: "RECORDED TRACE",
      badgeColor: "",
      rawNarration: tx.rawNarration,
      amount: tx.amount,
      rail: tx.rail,
      vendorName: tx.vendorClientName,
      activePathIds: Object.keys(nodes),
      nodes,
      finalOutcome: {
        status: tx.status === "vouched" ? "categorized" : tx.status,
        glAccount: tx.category,
        itcEligible: false,
        reasonSummary: tx.citation.explanation,
      },
    };
  }, [tx.id, signature, tx.category, tx.status]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [inspectedNodeId, setInspectedNodeId] = useState(
    scenario.activePathIds[0],
  );
  const [viewMode, setViewMode] = useState<"human" | "deep_inspection">(
    "human",
  );
  const [replayNonce, setReplayNonce] = useState(0);
  const [streamError, setStreamError] = useState("");
  useEffect(() => {
    setActiveStepIndex(0);
    setInspectedNodeId(scenario.activePathIds[0]);
    setIsPlaying(true);
  }, [selectedScenarioId]);
  useEffect(() => {
    if (!isPlaying) return;
    setStreamError("");
    const controller = new AbortController();
    void (async () => {
      try {
        const headers = await authHeaders();
        if (controller.signal.aborted) return;
        await streamTrace(
          `/api/transactions/${encodeURIComponent(tx.id)}/trace`,
          headers,
          controller.signal,
          event => {
            if (controller.signal.aborted) return;
            setActiveStepIndex(event.index);
            setInspectedNodeId(scenario.activePathIds[event.index]);
          },
        );
        if (!controller.signal.aborted) setIsPlaying(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        setIsPlaying(false);
        setStreamError(`${(error as Error).message} Use replay to reconnect.`);
      }
    })();
    return () => controller.abort();
  }, [tx.id, isPlaying, replayNonce, signature]);
  const handleSelectNode = (nodeId: string, idx: number) => {
    setInspectedNodeId(nodeId);
    setActiveStepIndex(idx);
    setIsPlaying(false);
    if (nodeId.includes("fraud")) {
      sound.playWarning();
    } else {
      sound.playPluck(0.5, 0.35);
    }
  };

  const handleRestart = () => {
    setActiveStepIndex(0);
    setInspectedNodeId(scenario.activePathIds[0]);
    setReplayNonce((n) => n + 1);
    setIsPlaying(true);
    sound.playPluck(0.2, 0.5);
  };

  const inspectedNode =
    scenario.nodes[inspectedNodeId] ||
    scenario.nodes[scenario.activePathIds[0]];
  const isFraudScenario = tx.status === "flagged_fraud";

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-black text-slate-100 flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header & Scenario Switcher */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-white/15">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-white/30 text-white backdrop-blur-xl shadow-[0_0_18px_rgba(255,255,255,0.15)]">
                <GitFork className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight font-sans">
                  <span className="bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                    Decision Trace
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
                  Audit trail showing ingestion, evidence matching,
                  classification, and review routing.
                </p>
              </div>
            </div>
          </div>

          <div className="text-xs">
            <label htmlFor="trace-transaction">Recorded transaction </label>
            <select
              id="trace-transaction"
              value={tx.id}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="bg-zinc-900 border border-white/20 rounded-xl p-2 max-w-sm"
            >
              {transactions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.date} · {displayText(t.vendorClientName)} · {formatINR(t.amount)}
                </option>
              ))}
            </select>
            <p className="text-slate-400 mt-2">
              Replay of stored evidence streamed from the server.
            </p>
            {streamError && (
              <p role="alert" className="text-red-300">
                {displayText(streamError)}
              </p>
            )}
          </div>
        </div>

        {/* Active Transaction Context Bar */}
        <motion.div
          layout
          className="bg-zinc-900/60 border border-white/20 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_32px_0_rgba(0,0,0,0.6)]"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                Statement Item:
              </span>
              <span className="font-bold text-white text-sm">
                {displayText(scenario.vendorName)}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-slate-200 border border-white/20">
                {scenario.rail}
              </span>
            </div>
            <div className="font-mono text-xs text-slate-200 break-all select-all">
              {displayText(scenario.rawNarration)}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              {/* Metallic Silver Amount */}
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight tabular-nums bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                {formatINR(scenario.amount)}
              </div>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Steps:{" "}
                <strong className="text-white">
                  {scenario.activePathIds.length}
                </strong>
              </div>
            </div>

            {/* Playback Controls with White Hover Fill */}
            <div className="flex items-center gap-1.5 pl-4 border-l border-white/20">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2.5 rounded-xl bg-zinc-900/80 text-slate-200 hover:bg-white hover:text-black hover:border-white cursor-pointer shadow border border-white/20 backdrop-blur-xl transition-all duration-200 hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleRestart}
                className="p-2.5 rounded-xl bg-zinc-900/80 text-slate-200 hover:bg-white hover:text-black hover:border-white cursor-pointer shadow border border-white/25 backdrop-blur-xl transition-all duration-200 hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
                title="Restart"
              >
                <RotateCcw className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* MAIN VISUAL DECISION TREE & GRAPH CANVAS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Visual Decision Graph */}
          <div className="lg:col-span-7 bg-zinc-950/70 border border-white/15 rounded-3xl p-5 sm:p-6 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col justify-between">
            {/* Glossy Silver Grid Pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

            <div className="flex items-center justify-between pb-3 border-b border-white/15 relative z-10">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-widest">
                Execution Steps
              </span>
            </div>

            {/* The Vertical / Cascading Nodes Flow */}
            <div className="relative z-10 py-6 space-y-4">
              {scenario.activePathIds.map((nodeId, idx) => {
                const node = scenario.nodes[nodeId];
                if (!node) return null;

                const isCurrent = activeStepIndex === idx;
                const isPast = activeStepIndex > idx;
                const isInspected = inspectedNodeId === nodeId;
                const isForkGate = node.type === "decision_gate";
                const isDivergedFraud =
                  nodeId.includes("fraud") || nodeId.includes("escrow");

                return (
                  <div key={nodeId} className="relative">
                    {/* Glowing Silver Connecting Cable to Next Node */}
                    {idx < scenario.activePathIds.length - 1 && (
                      <div className="absolute left-7 top-14 bottom-[-16px] w-[1.5px] pointer-events-none z-0">
                        <div
                          className={`w-full h-full ${
                            isDivergedFraud
                              ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                              : isPast || isCurrent
                                ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                : "bg-white/20"
                          }`}
                        />
                        {/* Animated Travelling Silver Spark */}
                        {(isPast || isCurrent) && (
                          <motion.div
                            className={`w-1.5 h-3 rounded-full -ml-[1.5px] ${
                              isDivergedFraud
                                ? "bg-red-300"
                                : "bg-white shadow-[0_0_10px_#ffffff]"
                            }`}
                            animate={{ y: [0, 40] }}
                            transition={{
                              repeat: Infinity,
                              duration: 1.2,
                              ease: "linear",
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Node Card with Glossy Silver Outlines */}
                    <motion.div
                      onClick={() => handleSelectNode(nodeId, idx)}
                      whileHover={{ scale: 1.015, x: 4 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{
                        type: "spring",
                        stiffness: 450,
                        damping: 25,
                      }}
                      className={`relative z-10 p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3.5 backdrop-blur-xl ${
                        isInspected
                          ? isDivergedFraud
                            ? "bg-red-950/40 border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.3)] ring-1 ring-red-400"
                            : "bg-zinc-800/80 border-white shadow-[0_0_25px_rgba(255,255,255,0.3)] ring-1 ring-white"
                          : isCurrent
                            ? isDivergedFraud
                              ? "bg-red-950/30 border-red-500/80"
                              : "bg-zinc-850/80 border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                            : isPast
                              ? "bg-zinc-900/60 border-white/25"
                              : "bg-transparent border-white/10 opacity-50"
                      }`}
                    >
                      {/* Node Icon / Stage Marker */}
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-bold border transition-colors ${
                          isInspected || isCurrent
                            ? isDivergedFraud
                              ? "bg-red-600 text-white border-red-400"
                              : "bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                            : isPast
                              ? "bg-zinc-800 text-white border-white/40"
                              : "bg-transparent text-slate-500 border-white/20"
                        }`}
                      >
                        {isPast ? <Check className="w-4 h-4" /> : idx + 1}
                      </div>

                      {/* Node Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs sm:text-sm font-sans truncate">
                              {displayText(node.label)}
                            </span>
                            {isForkGate && (
                              <span className="px-2 py-0.2 rounded-full text-[9px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 uppercase tracking-widest">
                                DECISION FORK
                              </span>
                            )}
                            {isDivergedFraud && (
                              <span className="px-2 py-0.2 rounded-full text-[9px] font-mono font-bold bg-red-600 text-white animate-pulse uppercase tracking-widest">
                                FRAUD DIVERGENCE
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-slate-300 shrink-0">
                            Recorded
                          </div>
                        </div>

                        {/* Subsystem Name */}
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate tracking-wide">
                          {displayText(node.systemName)}
                        </div>

                        {/* Human summary preview */}
                        <p className="text-xs text-slate-300 font-sans mt-1 line-clamp-1">
                          {displayText(node.humanExplanation)}
                        </p>

                        {/* Evaluated Condition / Criteria tag */}
                        {node.metrics.evaluatedCondition && (
                          <div className="mt-2 text-[10px] font-mono px-2 py-0.5 rounded-lg bg-black/60 border border-white/20 text-slate-200 inline-block">
                            {node.metrics.evaluatedCondition}
                          </div>
                        )}
                        {node.metrics.decisionCriteria &&
                          !node.metrics.evaluatedCondition && (
                            <div className="mt-2 text-[10px] font-mono px-2 py-0.5 rounded-lg bg-black/60 border border-white/20 text-slate-200 inline-block">
                              {displayText(node.metrics.decisionCriteria)}
                            </div>
                          )}
                      </div>

                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isInspected
                            ? "text-white rotate-90"
                            : "text-slate-600"
                        }`}
                      />
                    </motion.div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Pipeline Status Pill */}
            <div className="pt-4 border-t border-white/15 flex items-center justify-between text-xs font-mono text-slate-400 relative z-10">
              <div className="flex items-center gap-2">
                <span>Final Output:</span>
                <span
                  className={`font-bold ${isFraudScenario ? "text-red-400" : "text-white"}`}
                >
                  {scenario.finalOutcome.glAccount}
                </span>
              </div>
              <span className="text-slate-400">
                {scenario.activePathIds.length} recorded events
              </span>
            </div>
          </div>

          {/* Right Column: Node Deep Inspector & Human Explanation */}
          <div className="lg:col-span-5 bg-zinc-900/60 border border-white/20 rounded-3xl p-5 sm:p-6 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_8px_32px_0_rgba(0,0,0,0.8)] space-y-5 flex flex-col">
            {/* View Mode Switcher: Human vs Deep Machine Inspection */}
            <div className="flex items-center justify-between pb-3 border-b border-white/15">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-200" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-widest">
                  Step Details
                </span>
              </div>

              <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-white/20 text-xs font-mono">
                <button
                  onClick={() => setViewMode("human")}
                  className={`px-2.5 py-1 rounded-lg transition-all duration-200 cursor-pointer ${
                    viewMode === "human"
                      ? "bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black font-bold shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                      : "text-slate-400 hover:bg-white hover:text-black hover:shadow-sm"
                  }`}
                >
                  Explanation
                </button>
                <button
                  onClick={() => setViewMode("deep_inspection")}
                  className={`px-2.5 py-1 rounded-lg transition-all duration-200 cursor-pointer ${
                    viewMode === "deep_inspection"
                      ? "bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black font-bold shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                      : "text-slate-400 hover:bg-white hover:text-black hover:shadow-sm"
                  }`}
                >
                  Technical Details
                </button>
              </div>
            </div>

            {/* Selected Node Details */}
            {inspectedNode && (
              <div className="space-y-4 flex-1">
                {/* Node Identity */}
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white font-sans flex items-center gap-2">
                    <span>{displayText(inspectedNode.label)}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-slate-200 border border-white/20 font-normal">
                      {inspectedNode.type}
                    </span>
                  </h2>
                  <div className="text-xs font-mono text-slate-300">
                    Component: {displayText(inspectedNode.systemName)}
                  </div>
                </div>

                {/* Performance & Execution Metrics Grid with White Fill Reaction */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <AirBubbleBox className="p-3.5 rounded-2xl backdrop-blur-xl">
                    {(isHov) => (
                      <>
                        <div
                          className={`uppercase text-[10px] transition-colors ${isHov ? "text-black font-bold" : "text-slate-400"}`}
                        >
                          Processing time
                        </div>
                        <div
                          className={`font-bold text-sm mt-0.5 transition-colors ${isHov ? "text-black font-extrabold" : "text-white"}`}
                        >
                          Not measured
                        </div>
                      </>
                    )}
                  </AirBubbleBox>

                  <AirBubbleBox className="p-3.5 rounded-2xl backdrop-blur-xl">
                    {(isHov) => (
                      <>
                        <div
                          className={`uppercase text-[10px] transition-colors ${isHov ? "text-black font-bold" : "text-slate-400"}`}
                        >
                          Confidence
                        </div>
                        <div
                          className={`font-bold text-sm mt-0.5 transition-colors ${isHov ? "text-black font-extrabold" : "text-white"}`}
                        >
                          {inspectedNode.metrics.confidenceScore !== undefined
                            ? `${inspectedNode.metrics.confidenceScore}%`
                            : "Not scored"}
                        </div>
                      </>
                    )}
                  </AirBubbleBox>
                </div>

                {/* Content View: HUMAN-READABLE MODE */}
                {viewMode === "human" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-mono text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-300" />
                        <span>Why the AI Navigated Here (Plain English):</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed bg-zinc-900/60 p-4 rounded-2xl border border-white/15 font-sans shadow-inner">
                        {displayText(inspectedNode.humanExplanation)}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-mono text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-300" />
                        <span>Decision Rule / Gate Condition Evaluated:</span>
                      </div>
                      <div className="text-xs font-mono text-slate-200 bg-black/70 p-3.5 rounded-2xl border border-white/15 leading-relaxed">
                        {displayText(inspectedNode.metrics.decisionCriteria ||
                          inspectedNode.metrics.evaluatedCondition)}
                      </div>
                    </div>

                    {/* Scenario Outcome Summary if at final stage */}
                    <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/15 space-y-1.5 text-xs">
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                        Auditor Peace-of-Mind Notice:
                      </div>
                      <p className="text-slate-300 font-sans leading-relaxed">
                        {displayText(scenario.finalOutcome.reasonSummary)}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Content View: DEEP INSPECTION MODE */}
                {viewMode === "deep_inspection" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3 font-mono text-xs"
                  >
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Source transaction
                      </div>
                      <pre className="p-3 bg-black/80 text-slate-200 rounded-2xl border border-white/15 text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                        {displayText(inspectedNode.deepInspection.inputTensorOrPayload)}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Internal Math / Sequence Logic
                      </div>
                      <pre className="p-3 bg-black/80 text-slate-200 rounded-2xl border border-white/15 text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                        {displayText(inspectedNode.deepInspection.internalLogic)}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Output Result Packet
                      </div>
                      <pre className="p-3 bg-black/80 text-white rounded-2xl border border-white/15 text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                        {displayText(inspectedNode.deepInspection.outputResult)}
                      </pre>
                    </div>

                    {inspectedNode.deepInspection.hyperparameters && (
                      <div className="p-3 bg-zinc-900/80 rounded-2xl border border-white/15 text-[10px] text-slate-400 space-y-1">
                        <div className="text-white font-bold uppercase tracking-wider">
                          Model Hyperparameters:
                        </div>
                        <pre className="text-slate-200">
                          {JSON.stringify(
                            inspectedNode.deepInspection.hyperparameters,
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DecisionTraceView: React.FC<DecisionTraceViewProps> = (props) =>
  props.transactions?.length ? (
    <TraceGraph {...props} />
  ) : (
    <div className="p-12 text-slate-400">
      Sync Account Aggregator (AA) Bank Sync to inspect transaction decisions.
    </div>
  );
