import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Copy, Printer, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { formatINR, formatDateIndian } from "../utils/formatters";
import type { Transaction } from "../types/finance";
export function SharePageView({ token }: { token: string }) {
  const [tx, setTx] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<Transaction>(`/share/${encodeURIComponent(token)}`)
      .then(setTx)
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <div className="min-h-screen bg-black text-slate-100 px-6 py-12 flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-slate-400 mb-8">
          <ShieldCheck size={18} /> LedgerLens · Shared transaction · Read only
        </div>
        {error ? (
          <div role="alert" className="border border-white/20 rounded-3xl p-10">
            {error}
          </div>
        ) : !tx ? (
          <p>Loading shared record…</p>
        ) : (
          <motion.article
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-b from-zinc-800/80 to-zinc-950 border border-white/25 rounded-3xl p-8 sm:p-12 shadow-2xl"
          >
            <p className="text-xs text-slate-400 uppercase tracking-widest">
              {tx.type === "debit" ? "Payment to" : "Receipt from"}
            </p>
            <h1 className="text-2xl font-bold mt-3">{tx.vendorClientName}</h1>
            <p className="text-4xl font-mono font-bold mt-6">
              {formatINR(tx.amount)}
            </p>
            <p className="text-sm text-slate-400 mt-2">
              {formatDateIndian(tx.date)}
            </p>
            <div className="grid sm:grid-cols-2 gap-6 py-8 my-8 border-y border-white/15">
              <div>
                <p className="text-xs text-slate-400">Category</p>
                <p className="mt-2">{tx.category}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Review status</p>
                <p className="mt-2">{tx.status.replaceAll("_", " ")}</p>
              </div>
            </div>
            <h2 className="font-semibold">Why this category?</h2>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">
              {tx.citation.explanation}
            </p>
            {tx.citation.sourceDocument && (
              <p className="font-mono text-xs mt-3 break-all">
                Source: {tx.citation.sourceDocument}
              </p>
            )}
            <details className="mt-6 text-xs text-slate-400">
              <summary>Original bank narration</summary>
              <p className="mt-3 break-all">{tx.rawNarration}</p>
            </details>
            <div className="flex gap-3 mt-8">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                  } catch {
                    setError(
                      "Copy unavailable. Copy the address from your browser.",
                    );
                  }
                }}
                className="px-4 py-2 rounded-xl border border-white/20 flex gap-2 items-center text-sm"
              >
                <Copy size={14} />
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-white/20 flex gap-2 items-center text-sm"
              >
                <Printer size={14} />
                Print
              </button>
            </div>
          </motion.article>
        )}
      </div>
    </div>
  );
}
