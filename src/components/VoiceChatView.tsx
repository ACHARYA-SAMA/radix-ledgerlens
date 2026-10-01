import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { Transaction, AnalyticsSummary } from "../types/finance";
import { Phone, PhoneOff, Volume2, Sparkles, Send } from "lucide-react";
import { api } from "../lib/api";
import { VoiceCall, type CallStatus } from "../lib/voiceCall";
import { playVoiceAudio, requestVoiceAudio } from "../lib/voiceAudio";

interface VoiceChatViewProps {
  transactions: Transaction[];
  analytics: AnalyticsSummary;
}

interface ChatExchange {
  id: string;
  query: string;
  answer: string;
  timestamp: string;
  source?: "call";
  metadata?: {
    figures?: string;
    actionable?: string;
  };
}

const PRESET_QUERIES = [
  "What is our cash position?",
  "How many transactions need review?",
  "What is this week’s spending by category?",
  "Is anything overdue?",
];

export const VoiceChatView: React.FC<VoiceChatViewProps> = ({ transactions }) => {
  const latestDate = transactions.reduce((latest, tx) => tx.date > latest ? tx.date : latest, "");
  const datedPrompt = latestDate
    ? `What was the cash flow on ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${latestDate}T00:00:00Z`))}?`
    : null;
  const quickQuestions = datedPrompt ? [datedPrompt, ...PRESET_QUERIES] : PRESET_QUERIES;
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const isListening = callStatus === "listening";
  const inCall = !["idle", "error"].includes(callStatus);
  const [inputText, setInputText] = useState("");
  const [history, setHistory] = useState<ChatExchange[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const callRef = useRef<VoiceCall | null>(null);
  const playbackRef = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    callRef.current = new VoiceCall({
      onStatus: (status) => { if (mounted) setCallStatus(status); },
      onError: (message) => { if (mounted) setError(message); },
      onTranscript: (text) => { if (mounted) setInputText(text); },
      onAnswer: (query, answer) => {
        if (mounted) setHistory((previous) => [{
          id: crypto.randomUUID(), query, answer, source: "call",
          timestamp: new Date().toLocaleTimeString(),
        }, ...previous]);
      },
    });
    api<ChatExchange[]>("/chat")
      .then((saved) => { if (mounted) setHistory((current) => [...current, ...saved]); })
      .catch((e) => { if (mounted) setError(e.message); });
    return () => {
      mounted = false;
      callRef.current?.stop();
      callRef.current = null;
      playbackRef.current?.abort();
    };
  }, []);

  const speakText = async (text: string) => {
    if (inCall) return;
    playbackRef.current?.abort();
    const controller = new AbortController();
    playbackRef.current = controller;
    try {
      const url = await requestVoiceAudio(text, controller.signal);
      await playVoiceAudio(url, controller.signal);
    } finally {
      if (playbackRef.current === controller) playbackRef.current = null;
    }
  };

  const handleProcessQuery = async (queryText: string) => {
    if (!queryText.trim() || busy || inCall) return;
    setBusy(true);
    setError("");
    try {
      const exchange = await api<ChatExchange>("/ask", { query: queryText });
      setHistory((prev) => [exchange, ...prev]);
      await speakText(exchange.answer);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleCall = () => {
    if (inCall) callRef.current?.stop();
    else { playbackRef.current?.abort(); callRef.current?.start(); }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    handleProcessQuery(inputText);
    setInputText("");
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-black text-slate-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-6">
        {error && (
          <p role="alert" className="text-xs text-amber-200">
            {error}
          </p>
        )}
        {busy && (
          <p className="text-xs text-slate-400">Checking imported records…</p>
        )}
        {/* Header */}
        <div className="border-b border-white/15 pb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight font-sans">
              <span className="bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Financial Voice Assistant
              </span>
            </h1>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-zinc-800/80 text-slate-200 border border-white/20 font-bold uppercase tracking-wider">
              RADIX INTELLIGENCE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Ask about imported bank statements, including cash flow and spending
            on a specific date. Answers use the same transactions as Analytics
            and include visible text transcripts.
          </p>
        </div>

        {/* Minimal Voice Chat Surface with Glossy Silver Metal Glassmorphism */}
        <div className="relative bg-zinc-900/80 border border-white/25 rounded-3xl p-6 sm:p-8 text-center space-y-6 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_8px_32px_0_rgba(0,0,0,0.8)] overflow-hidden">
          {/* Ambient Silver Ring Glow */}
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              {isListening && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full bg-white/20"
                    animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.4,
                      ease: "easeOut",
                    }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full bg-white/30"
                    animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.4,
                      ease: "easeOut",
                      delay: 0.3,
                    }}
                  />
                </>
              )}

              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={toggleCall}
                disabled={busy}
                aria-label={inCall ? "Hang Up" : "Call"}
                aria-pressed={inCall}
                className={`relative z-10 w-22 h-22 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-2xl backdrop-blur-xl group hover:bg-white hover:text-black hover:shadow-[0_4px_30px_rgba(255,255,255,0.4)] ${
                  inCall
                    ? "bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] border-2 border-red-400"
                    : "bg-zinc-800/90 text-white border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                }`}
                title={
                  inCall ? "Hang Up" : "Call LedgerLens"
                }
              >
                {inCall ? <PhoneOff className="w-9 h-9 text-slate-200 group-hover:text-black transition-colors" /> : <Phone className="w-9 h-9 text-slate-200 group-hover:text-black transition-colors" />}
              </motion.button>
            </div>

            <div className="text-xs font-mono text-slate-400" role="status" aria-live="polite">
              <div className="text-white font-bold mb-2">{inCall ? "Hang Up" : "Call"}</div>
              {isListening ? (
                <span className="text-white font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>Listening... speak query now</span>
                </span>
              ) : (
                <span>{callStatus === "connecting" ? "Connecting…" : callStatus === "speaking" ? "Speaking… listening resumes automatically" : callStatus === "thinking" ? "Checking imported records…" : callStatus === "error" ? "Call ended · see the error above" : "Call for hands-free questions or select a prompt below"}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Calls and typed questions both use imported statement data.</p>
          </div>

          {/* Quick-Prompt Suggestions with Glassmorphic Outlines and White Hover Fill */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {quickQuestions.map((query, idx) => (
              <motion.button
                key={idx}
                disabled={inCall || busy}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setInputText(query);
                  handleProcessQuery(query);
                }}
                className="px-3.5 py-1.5 text-xs text-slate-200 bg-zinc-800/60 border border-white/20 rounded-full hover:bg-white hover:text-black hover:border-white transition-all duration-200 cursor-pointer text-left shadow-sm hover:shadow-[0_4px_15px_rgba(255,255,255,0.3)] backdrop-blur-xl"
              >
                "{query}"
              </motion.button>
            ))}
          </div>

          {/* Text Input with Glossy Silver Outline */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 pt-3 border-t border-white/15"
          >
            <input
              type="text"
              placeholder="Or type your financial query here..."
              value={inputText}
              disabled={inCall || busy}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 text-xs bg-black/60 border border-white/20 rounded-2xl text-white font-sans focus:outline-none focus:border-white placeholder-slate-500 backdrop-blur-xl"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={inCall || busy}
              className="px-5 py-2.5 text-xs font-bold bg-gradient-to-r from-slate-100 via-white to-slate-200 text-black hover:bg-white hover:text-black hover:border-white rounded-2xl transition-all duration-200 flex items-center gap-1.5 cursor-pointer border border-white/50 shadow-md hover:shadow-[0_4px_20px_rgba(255,255,255,0.4)]"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </motion.button>
          </form>
        </div>

        {/* Visible Transcripts & Spoken Answers */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1 border-b border-white/15">
            <span>TRANSCRIPT HISTORY</span>
            <span className="text-slate-300 font-bold">IMPORTED NOVA DATA</span>
          </div>

          <div className="space-y-4">
            {history.map((exchange) => (
              <motion.div
                key={exchange.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 450, damping: 26 }}
                className="bg-zinc-900/60 border border-white/20 rounded-3xl p-6 space-y-4 backdrop-blur-2xl shadow-xl"
              >
                {/* User What Was Heard */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-bold shrink-0 border border-white/30">
                    Q
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {exchange.source === "call" ? "CALL · IMPORTED NOVA DATA" : "VOICE TRANSCRIPT"} · {exchange.timestamp}
                    </div>
                    <div className="text-sm font-semibold text-white mt-0.5 font-sans">
                      "{exchange.query}"
                    </div>
                  </div>
                </div>

                {/* Engine Spoken Answer (Text Transcript) */}
                <div className="flex items-start gap-3 pt-3 border-t border-white/15">
                  <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center text-xs font-bold shrink-0 shadow-md">
                    <Sparkles className="w-4 h-4 text-black" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest font-bold">
                        LedgerLens Spoken Response (Text Transcript)
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          setError("");
                          void speakText(exchange.answer).catch((e: Error) => {
                            if (e.name !== "AbortError") setError(e.message);
                          });
                        }}
                        disabled={inCall || busy}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] text-slate-400 hover:bg-white hover:text-black transition-all duration-200 cursor-pointer"
                        title="Replay Voice Audio"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-slate-300 hover:text-black" />
                        <span>Re-read</span>
                      </motion.button>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {exchange.answer}
                    </p>

                    {exchange.metadata && (
                      <div className="flex items-center gap-3 pt-1 text-[11px] font-mono">
                        <span className="text-white font-bold">
                          {exchange.metadata.figures}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">
                          {exchange.metadata.actionable}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
