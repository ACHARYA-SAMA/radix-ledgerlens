import { displayText } from "../../shared/branding.ts";
import React, { useState, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "motion/react";
import { Transaction } from "../types/finance";
import { formatINR, formatDateIndian } from "../utils/formatters";
import {
  Check,
  Edit2,
  UserX,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Tag,
} from "lucide-react";
import { CATEGORIES } from "../../shared/categories";
import { sound } from "../utils/audioSynthesizer";

interface ReviewQueueViewProps {
  transactions: Transaction[];
  onAcceptTransaction: (id: string) => void;
  onCorrectCategory: (
    id: string,
    newCategory: string,
    newSubCategory: string,
  ) => void;
  onFlagFraud: (id: string) => void;
  onMarkPersonal: (id: string) => void;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORIES)
  .filter(([id]) => id !== "uncategorized" && id !== "internal_transfer")
  .map(([id, label]) => ({ cat: id, sub: label }));

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  transactions,
  onAcceptTransaction,
  onCorrectCategory,
  onFlagFraud,
  onMarkPersonal,
}) => {
  const queueItems = transactions.filter(
    (tx) => tx.status === "needs_review" || tx.status === "flagged_fraud",
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [selectedCatIndex, setSelectedCatIndex] = useState(0);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(
    null,
  );

  const currentItem =
    queueItems[Math.min(currentIndex, Math.max(0, queueItems.length - 1))] ||
    null;

  // Kinetic Drag Physics
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const rotateZ = useTransform(dragX, [-200, 200], [-12, 12]);
  const opacityRight = useTransform(dragX, [30, 140], [0, 1]);
  const opacityLeft = useTransform(dragX, [-30, -140], [0, 1]);
  const opacityDown = useTransform(dragY, [30, 140], [0, 1]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (!currentItem) return;

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleAccept();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setIsEditingCategory((prev) => !prev);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFlag();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        handlePersonal();
      } else if (e.key === "ArrowRight" || e.key === "j") {
        if (currentIndex < queueItems.length - 1) {
          setCurrentIndex(currentIndex + 1);
          sound.playPluck(0.6, 0.3);
        }
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
          sound.playPluck(0.4, 0.3);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentItem, currentIndex, queueItems.length]);

  const handleAccept = async () => {
    if (!currentItem) return;
    sound.playActionSuccess();
    try {
      await onAcceptTransaction(currentItem.id);
    } catch {
      return;
    }
    setLastActionMessage(
      `Confirmed category for ${displayText(currentItem.vendorClientName)}`,
    );
    setIsEditingCategory(false);
    if (currentIndex >= queueItems.length - 1) {
      setCurrentIndex(Math.max(0, queueItems.length - 2));
    }
  };

  const handleSaveCorrection = async () => {
    if (!currentItem) return;
    const choice = CATEGORY_OPTIONS[selectedCatIndex];
    try {
      await onCorrectCategory(currentItem.id, choice.cat, choice.sub);
    } catch {
      return;
    }
    sound.playActionSuccess();
    setLastActionMessage(`Updated category to "${choice.sub}"`);
    setIsEditingCategory(false);
    if (currentIndex >= queueItems.length - 1) {
      setCurrentIndex(Math.max(0, queueItems.length - 2));
    }
  };

  const handleFlag = async () => {
    if (!currentItem) return;
    sound.playWarning();
    try {
      await onFlagFraud(currentItem.id);
    } catch {
      return;
    }
    setLastActionMessage(
      `Flagged security risk: ${displayText(currentItem.vendorClientName)}`,
    );
  };

  const handlePersonal = async () => {
    if (!currentItem) return;
    sound.playPluck(0.2, 0.5);
    try {
      await onMarkPersonal(currentItem.id);
    } catch {
      return;
    }
    setLastActionMessage(`Marked as personal non-business drawing`);
    if (currentIndex >= queueItems.length - 1) {
      setCurrentIndex(Math.max(0, queueItems.length - 2));
    }
  };

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number; y: number } },
  ) => {
    if (info.offset.x > 120) {
      handleAccept();
    } else if (info.offset.x < -120) {
      handleFlag();
    } else if (info.offset.y > 110) {
      handlePersonal();
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-black text-slate-100 flex flex-col items-center justify-start p-6">
      <div className="w-full max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/15">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight font-sans">
                <span className="bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Review Queue
                </span>
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-mono bg-zinc-800/80 text-slate-200 border border-white/20 rounded-full font-bold shadow-sm">
                {queueItems.length} PENDING
              </span>
            </div>
          </div>

          {/* Keyboard shortcuts */}
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-zinc-900/70 px-3.5 py-1.5 rounded-xl border border-white/20 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
            <span>
              <kbd className="px-1.5 py-0.5 bg-black rounded border border-white/20 text-slate-200">
                A
              </kbd>{" "}
              Confirm
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-black rounded border border-white/20 text-slate-200">
                C
              </kbd>{" "}
              Correct
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-black rounded border border-white/20 text-slate-200">
                P
              </kbd>{" "}
              Personal
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-black rounded border border-white/20 text-slate-200">
                F
              </kbd>{" "}
              Flag
            </span>
          </div>
        </div>

        {/* Action confirmation notification */}
        <AnimatePresence>
          {lastActionMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/90 border border-white/30 rounded-xl text-xs font-mono text-white backdrop-blur-xl shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
            >
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
              <span>{lastActionMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Queue Body */}
        {queueItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-24 text-center border border-dashed border-white/20 rounded-3xl bg-zinc-900/40 p-8 space-y-3 backdrop-blur-2xl shadow-xl"
          >
            <div className="w-14 h-14 rounded-full bg-zinc-800 text-white mx-auto flex items-center justify-center border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              <Check className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white font-sans">
              Review queue cleared
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              No transactions currently need review. Classification evidence
              remains available in the ledger.
            </p>
          </motion.div>
        ) : currentItem ? (
          <div className="relative py-4">
            {/* Kinetic Glassmorphic Drag Card with Glossy Silver Sheen */}
            <motion.div
              key={currentItem.id}
              drag
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.8}
              onDragEnd={handleDragEnd}
              style={{ x: dragX, y: dragY, rotateZ }}
              whileTap={{ cursor: "grabbing" }}
              className="relative bg-zinc-900/80 border border-white/25 rounded-3xl p-6 sm:p-8 space-y-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_16px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl cursor-grab select-none overflow-hidden"
            >
              {/* Swipe Right Indicator (Confirm) */}
              <motion.div
                style={{ opacity: opacityRight }}
                className="absolute top-6 right-6 pointer-events-none px-4 py-2 rounded-xl bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_25px_rgba(255,255,255,0.4)] border border-white z-30"
              >
                <Check className="w-4 h-4 text-black" />
                <span>CONFIRM</span>
              </motion.div>

              {/* Swipe Left Indicator (Flag Fraud) */}
              <motion.div
                style={{ opacity: opacityLeft }}
                className="absolute top-6 left-6 pointer-events-none px-4 py-2 rounded-xl bg-red-600 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_25px_rgba(239,68,68,0.5)] border border-red-400 z-30"
              >
                <AlertTriangle className="w-4 h-4 text-white" />
                <span>FLAG FRAUD</span>
              </motion.div>

              {/* Swipe Down Indicator (Personal) */}
              <motion.div
                style={{ opacity: opacityDown }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none px-4 py-2 rounded-xl bg-zinc-800 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_25px_rgba(255,255,255,0.2)] border border-white/30 z-30"
              >
                <UserX className="w-4 h-4 text-white" />
                <span>PERSONAL</span>
              </motion.div>

              {/* Top Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-300">
                    Transaction {currentIndex + 1} of {queueItems.length}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-zinc-800/90 text-slate-200 rounded border border-white/20">
                    {currentItem.rail}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatDateIndian(currentItem.date)}
                  </span>
                </div>

                <div className="text-right">
                  {/* Glossy Polished Silver Metallic Amount */}
                  <div className="text-3xl font-black font-mono tracking-tight tabular-nums bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(255,255,255,0.15)]">
                    {formatINR(currentItem.amount)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {currentItem.bankName} {currentItem.accountNumber}
                  </div>
                </div>
              </div>

              {/* Bank Narration Box */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  Statement Narration
                </div>
                <div className="p-4 bg-black/70 rounded-2xl border border-white/15 font-mono text-xs text-slate-200 break-all select-all shadow-inner">
                  {displayText(currentItem.rawNarration)}
                </div>
              </div>

              {/* Categorization & Reasoning */}
              <div className="p-5 bg-zinc-900/60 rounded-2xl border border-white/20 space-y-3 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white font-mono">
                    <Sparkles className="w-4 h-4 text-slate-300" />
                    <span>Classification ({currentItem.confidence}%)</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {displayText(currentItem.citation.ruleName || currentItem.citation.type)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Suggested Vendor / Entity
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {displayText(currentItem.vendorClientName)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Suggested General Ledger Head
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {displayText(currentItem.category)} · {displayText(currentItem.subCategory)}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-300 leading-relaxed border-t border-white/15 pt-2 font-sans">
                  <strong className="text-white font-semibold">Reason: </strong>
                  {displayText(currentItem.citation.explanation)}
                </div>
                {!!currentItem.duplicateIds?.length && (
                  <p className="text-xs text-amber-200">
                    Possible duplicate: this line shares a reference or
                    statement details with {currentItem.duplicateIds.length}{" "}
                    other line(s). Confirm the bank record before accepting.
                  </p>
                )}
                {currentItem.fraudWarning && (
                  <p className="text-xs text-red-300">
                    {displayText(currentItem.fraudWarning.reason)}
                  </p>
                )}
              </div>

              {/* Inline Category Correction Drawer */}
              <AnimatePresence>
                {isEditingCategory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-5 bg-zinc-900/80 rounded-2xl border border-white/30 space-y-3 overflow-hidden backdrop-blur-xl shadow-2xl"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5 font-sans">
                        <Tag className="w-3.5 h-3.5 text-slate-300" />
                        <span>Select Correct General Ledger Category</span>
                      </span>
                      <button
                        onClick={() => setIsEditingCategory(false)}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {CATEGORY_OPTIONS.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedCatIndex(i)}
                          className={`text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer group ${
                            selectedCatIndex === i
                              ? "bg-white/20 border-white text-white font-bold hover:bg-white hover:text-black shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
                              : "bg-black/50 border-white/15 text-slate-300 hover:bg-white hover:text-black hover:border-white"
                          }`}
                        >
                          <div className="font-semibold text-slate-100 group-hover:text-black transition-colors">
                            {opt.sub}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSaveCorrection}
                        className="px-4 py-2 text-xs font-bold bg-white text-black hover:bg-white hover:text-black hover:border-white rounded-xl transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_4px_20px_rgba(255,255,255,0.4)]"
                      >
                        Confirm Reassigned Category
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons with Glossy Silver & White Hover Fill */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/15">
                <div className="flex items-center gap-1.5">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={currentIndex === 0}
                    onClick={() => {
                      setCurrentIndex(currentIndex - 1);
                      sound.playPluck(0.4, 0.3);
                    }}
                    className="p-2.5 rounded-xl bg-zinc-900/70 text-slate-300 hover:bg-white hover:text-black hover:border-white disabled:opacity-20 border border-white/25 cursor-pointer backdrop-blur-xl transition-all duration-200 hover:shadow-md"
                    title="Previous item (K)"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={currentIndex >= queueItems.length - 1}
                    onClick={() => {
                      setCurrentIndex(currentIndex + 1);
                      sound.playPluck(0.6, 0.3);
                    }}
                    className="p-2.5 rounded-xl bg-zinc-900/70 text-slate-300 hover:bg-white hover:text-black hover:border-white disabled:opacity-20 border border-white/25 cursor-pointer backdrop-blur-xl transition-all duration-200 hover:shadow-md"
                    title="Next item (J)"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handlePersonal}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-900/70 text-slate-300 hover:bg-white hover:text-black hover:border-white rounded-xl border border-white/25 transition-all duration-200 cursor-pointer backdrop-blur-xl hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)] group"
                  >
                    <UserX className="w-3.5 h-3.5 text-slate-400 group-hover:text-black transition-colors" />
                    <span>Mark as personal</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setIsEditingCategory(!isEditingCategory)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-900/70 text-slate-300 hover:bg-white hover:text-black hover:border-white rounded-xl border border-white/25 transition-all duration-200 cursor-pointer backdrop-blur-xl hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)] group"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-black transition-colors" />
                    <span>Correct category</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleFlag}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-red-950/30 text-red-200 hover:bg-white hover:text-black hover:border-white rounded-xl border border-red-500/40 transition-all duration-200 cursor-pointer backdrop-blur-xl hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)] group"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 group-hover:text-black transition-colors" />
                    <span>Flag for fraud check</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={handleAccept}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black hover:bg-white hover:text-black hover:border-white rounded-xl transition-all duration-200 border border-white/60 shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.4)] cursor-pointer group"
                  >
                    <Check className="w-4 h-4 text-black" />
                    <span>Confirm category</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
