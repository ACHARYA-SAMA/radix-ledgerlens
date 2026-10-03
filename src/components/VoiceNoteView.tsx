/* Repository touch marker. */
import { displayText } from "../../shared/branding.ts";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { VoiceNote, Transaction } from "../types/finance";
import { formatINR } from "../utils/formatters";
import {
  Mic,
  Square,
  Check,
  Clock,
  Link,
  Edit3,
  FileAudio,
} from "lucide-react";
import { api } from "../lib/api";
import { startSpeech } from "../lib/speech";
import { sound } from "../utils/audioSynthesizer";

interface VoiceNoteViewProps {
  voiceNotes: VoiceNote[];
  transactions: Transaction[];
  onMatch: (id: string, transactionId: string) => Promise<void>;
  onAddVoiceNote: (note: VoiceNote) => Promise<void>;
}

const draftKey = "ledgerlens-voice-intake-draft";
const savedDraft = () => {
  try { return sessionStorage.getItem(draftKey) ?? ""; } catch { return ""; }
};
const keepDraft = (text: string) => {
  try {
    if (text) sessionStorage.setItem(draftKey, text);
    else sessionStorage.removeItem(draftKey);
  } catch { /* Draft remains in the current form. */ }
};

export const VoiceNoteView: React.FC<VoiceNoteViewProps> = ({
  voiceNotes,
  onAddVoiceNote,
  transactions,
  onMatch,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcriptDraft, setTranscriptDraft] = useState(savedDraft);
  const [extractedEntity, setExtractedEntity] = useState("");
  const [extractedAmount, setExtractedAmount] = useState<number>(0);
  const [extractedCategory, setExtractedCategory] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasRecordedSample, setHasRecordedSample] = useState(() => Boolean(savedDraft()));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live Simulated Audio Waveform Visualizer in Cyber Emerald
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      phase += 0.05;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Draw 36 vertical visualizer bars in shades of glossy silver metal
      const barCount = 36;
      const barWidth = width / (barCount * 1.5);
      const gap = barWidth * 0.5;

      for (let i = 0; i < barCount; i++) {
        let amp = 0.15;
        if (isRecording) {
          amp =
            0.25 +
            Math.abs(Math.sin(phase + i * 0.3)) * 0.7 +
            Math.random() * 0.1;
        } else if (isProcessing) {
          amp = 0.3 + Math.abs(Math.sin(phase * 2 + i * 0.2)) * 0.5;
        } else {
          amp = 0.08 + Math.abs(Math.sin(phase * 0.5 + i * 0.15)) * 0.12;
        }

        const barH = amp * height;
        const x = i * (barWidth + gap) + gap;
        const y = (height - barH) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, "#FFFFFF");
        grad.addColorStop(0.5, "#CBD5E1");
        grad.addColorStop(1, "#64748B");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [3]);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [isRecording, isProcessing]);

  useEffect(() => {
    let interval: number | null = null;
    if (isRecording) {
      interval = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
        sound.playPluck(0.3 + (recordingSeconds % 5) * 0.1, 0.2);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, recordingSeconds]);

  const [error, setError] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  const updateTranscript = (text: string) => {
    setTranscriptDraft(text);
    keepDraft(text);
  };
  const extract = async (text = transcriptDraft) => {
    setIsProcessing(true);
    setError("");
    try {
      const r = await api<any>("/voice/extract", { transcript: text });
      setExtractedEntity(r.extractedEntity);
      setExtractedAmount(r.extractedAmount);
      setExtractedCategory(r.extractedCategory);
      if (r.warning) setError(r.warning);
      setHasRecordedSample(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };
  const startRecording = () => {
    setRecordingSeconds(0);
    setIsRecording(true);
    setHasRecordedSample(true);
    setError("");
    stopRef.current = startSpeech(
      (text) => {
        updateTranscript(text);
        void extract(text);
      },
      () => setIsRecording(false),
      setError,
    );
  };
  const stopRecording = () => {
    stopRef.current?.();
    setIsRecording(false);
  };
  const handleConfirmVoiceNote = async () => {
    if (!transcriptDraft.trim()) return;
    try {
      await onAddVoiceNote({
        id: "",
        recordedAt: "",
        durationSeconds: recordingSeconds,
        transcript: transcriptDraft,
        extractedEntity,
        extractedAmount,
        extractedCategory,
        status: "pending_match",
      });
      setHasRecordedSample(false);
      updateTranscript("");
      setExtractedAmount(0);
      setExtractedEntity("");
      setExtractedCategory("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const loadSample = () => {
    setHasRecordedSample(true);
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-black text-slate-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="border-b border-white/15 pb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight font-sans">
              <span className="bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Voice-Note Expense Intake
              </span>
            </h1>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-zinc-800/80 text-slate-200 border border-white/20 font-bold uppercase tracking-wider">
              AUDIO STREAM
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Record voice memos for field advances, cash, or unvouched UPI
            transfers. The engine extracts the entity, Rupee amount, and likely
            category, holding it in pending state until matching bank statement
            lines sync.
          </p>
        </div>

        {/* Recording Console with Glossy Silver Metal Outlines */}
        <div className="relative bg-zinc-900/80 border border-white/25 rounded-3xl p-6 sm:p-8 text-center space-y-6 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_8px_32px_0_rgba(0,0,0,0.8)] overflow-hidden">
          {/* Audio Canvas Visualizer */}
          <div className="w-full h-20 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={420}
              height={70}
              className="w-full max-w-md h-full"
            />
          </div>

          <div className="flex flex-col items-center justify-center space-y-4">
            {/* Record Mic Button with Glossy Silver Metallic Glass */}
            <div className="relative">
              {isRecording && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full bg-white/20"
                    animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "easeOut",
                    }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full bg-white/30"
                    animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "easeOut",
                      delay: 0.3,
                    }}
                  />
                </>
              )}

              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative z-10 w-22 h-22 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-2xl backdrop-blur-xl group hover:bg-white hover:text-black hover:shadow-[0_4px_30px_rgba(255,255,255,0.4)] ${
                  isRecording
                    ? "bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] border-2 border-red-400"
                    : "bg-zinc-800/90 text-white border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                }`}
                title={
                  isRecording ? "Stop Recording" : "Start Recording Voice Note"
                }
              >
                {isRecording ? (
                  <Square className="w-8 h-8 fill-current text-white group-hover:text-black" />
                ) : (
                  <Mic className="w-9 h-9 text-slate-200 group-hover:text-black transition-colors" />
                )}
              </motion.button>
            </div>

            <div className="font-mono text-sm">
              {isRecording ? (
                <div className="text-red-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span>
                    RECORDING: 00:
                    {recordingSeconds < 10
                      ? `0${recordingSeconds}`
                      : recordingSeconds}
                  </span>
                </div>
              ) : isProcessing ? (
                <div className="text-slate-200 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-spin" />
                  <span>Extracting note details…</span>
                </div>
              ) : (
                <div className="text-slate-400 text-xs">
                  Tap microphone to record or{" "}
                  <button
                    onClick={loadSample}
                    className="text-white underline hover:text-slate-300 cursor-pointer font-bold"
                  >
                    type a note
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-amber-200">
              {displayText(error)}
            </p>
          )}
          {/* Transcript Preview & Correction Surface */}
          <AnimatePresence>
            {hasRecordedSample && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-left bg-zinc-900/80 border border-white/25 rounded-2xl p-5 space-y-4 overflow-hidden backdrop-blur-xl shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2">
                  <span className="text-xs font-mono text-white flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-slate-300" />
                    <span>Review & Correct Transcript Before Logging</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-200 font-bold">
                    Confirm before saving
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                    Recognized Speech
                  </label>
                  <textarea
                    aria-label="Voice note transcript"
                    value={transcriptDraft}
                    onChange={(e) => updateTranscript(e.target.value)}
                    rows={2}
                    className="w-full p-3 bg-black/70 border border-white/20 rounded-xl text-xs text-white font-sans focus:outline-none focus:border-white"
                  />
                </div>

                <button
                  onClick={() => void extract()}
                  disabled={isProcessing || !transcriptDraft.trim()}
                  className="px-4 py-2 text-xs border border-white/20 rounded-xl disabled:opacity-40"
                >
                  Extract details from transcript
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3.5 bg-black/50 rounded-xl border border-white/15">
                    <div className="text-slate-400 uppercase text-[10px]">
                      Vendor / Counterparty
                    </div>
                    <input
                      aria-label="Vendor or counterparty"
                      type="text"
                      value={extractedEntity}
                      onChange={(e) => setExtractedEntity(e.target.value)}
                      className="w-full bg-transparent text-white font-semibold mt-0.5 focus:outline-none"
                    />
                  </div>

                  <div className="p-3.5 bg-black/50 rounded-xl border border-white/15">
                    <div className="text-slate-400 uppercase text-[10px]">
                      Extracted Amount (₹)
                    </div>
                    <input
                      aria-label="Amount in rupees"
                      type="number"
                      value={extractedAmount}
                      onChange={(e) =>
                        setExtractedAmount(Number(e.target.value))
                      }
                      className="w-full bg-transparent text-white font-bold mt-0.5 focus:outline-none"
                    />
                  </div>

                  <div className="p-3.5 bg-black/50 rounded-xl border border-white/15">
                    <div className="text-slate-400 uppercase text-[10px]">
                      Inferred GL Head
                    </div>
                    <input
                      aria-label="Category"
                      type="text"
                      value={extractedCategory}
                      onChange={(e) => setExtractedCategory(e.target.value)}
                      className="w-full bg-transparent text-slate-200 font-semibold mt-0.5 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => { updateTranscript(""); setHasRecordedSample(false); }}
                    className="px-3.5 py-1.5 text-xs text-slate-400 hover:bg-white hover:text-black rounded-lg transition-all duration-200 cursor-pointer"
                  >
                    Discard
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleConfirmVoiceNote}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black hover:bg-white hover:text-black hover:border-white rounded-xl transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_4px_20px_rgba(255,255,255,0.4)] group border border-white/50"
                  >
                    <Check className="w-3.5 h-3.5 text-black" />
                    <span>Log to Waiting Queue</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Existing Logged Voice Notes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1 border-b border-white/15">
            <span>RECORDED VOICE INTAKE LOG ({voiceNotes.length})</span>
            <span className="text-slate-300">
              MANUALLY LOGGED · CONFIRM BANK MATCH
            </span>
          </div>

          <div className="space-y-3">
            {voiceNotes.map((note) => {
              const isPending = note.status === "pending_match";

              return (
                <motion.div
                  key={note.id}
                  whileHover={{ y: -2, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 450, damping: 26 }}
                  className="p-5 bg-zinc-900/60 border border-white/20 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-xl shadow-lg"
                >
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-4 h-4 text-slate-300" />
                      <span className="font-bold text-white text-xs">
                        {displayText(note.extractedEntity)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        · {note.recordedAt}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 italic font-sans leading-relaxed">
                      "{displayText(note.transcript)}"
                    </p>

                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 pt-0.5">
                      <span>
                        Category:{" "}
                        <strong className="text-white">
                          {displayText(note.extractedCategory)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-2 shrink-0">
                    {/* Metallic Silver Amount */}
                    <div className="text-lg font-black font-mono tracking-tight tabular-nums bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]">
                      {formatINR(note.extractedAmount)}
                    </div>

                    {isPending && (
                      <select
                        aria-label={`Match note for ${displayText(note.extractedEntity)}`}
                        defaultValue=""
                        className="bg-zinc-900 text-xs max-w-xs p-2 rounded-lg border border-white/20"
                        onChange={async (e) => {
                          const id = e.target.value;
                          if (id)
                            try {
                              await onMatch(note.id, id);
                            } catch (error) {
                              setError((error as Error).message);
                            }
                        }}
                      >
                        <option value="">Confirm bank match…</option>
                        {transactions
                          .filter(
                            (t) =>
                              Math.round(t.amount * 100) ===
                              Math.round(note.extractedAmount * 100),
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.date} · {t.vendorClientName} · {t.type}
                            </option>
                          ))}
                      </select>
                    )}
                    {isPending ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-300 bg-zinc-800/80 border border-white/20 px-2.5 py-1 rounded-full">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Pending bank match</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-white bg-zinc-800/90 border border-white/30 px-2.5 py-1 rounded-full">
                        <Link className="w-3 h-3 text-slate-300" />
                        <span>Matched to #{note.matchedTransactionId}</span>
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
