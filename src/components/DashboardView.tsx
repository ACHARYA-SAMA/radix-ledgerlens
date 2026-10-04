/* Repository touch marker. */
import type { CfoResult } from "../../shared/voiceCfo.ts";
import { displayText } from "../../shared/branding.ts";
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Transaction } from "../types/finance";
import { formatINR, formatDateIndian } from "../utils/formatters";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  FileText,
  ArrowUpDown,
  Sparkles,
  Lock,
} from "lucide-react";
import { sound } from "../utils/audioSynthesizer";

interface DashboardViewProps {
  cfo?: CfoResult | null;
  transactions: Transaction[];
  onSelectTransactionForTrace: (tx: Transaction) => void;
  onOpenSharePage: (token: string) => void;
  onTriggerPluck?: (ratio: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  cfo,
  onSelectTransactionForTrace,
  onOpenSharePage,
  onTriggerPluck,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRail, setSelectedRail] = useState<string>("ALL");
  const [selectedAccount, setSelectedAccount] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [sortField, setSortField] = useState<"date" | "amount" | "confidence">(
    "date",
  );
  const [page, setPage] = useState(0);
  useEffect(
    () => setPage(0),
    [searchQuery, selectedRail, selectedAccount, selectedStatus],
  );
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => { if(cfo?.ledgerFilter) {setPage(0); setSearchQuery(""); setSelectedAccount("ALL"); setSelectedRail("ALL"); setSelectedStatus("ALL"); document.getElementById("cfo-ledger")?.scrollIntoView({behavior:"smooth",block:"start"});} }, [cfo?.id]);
  useEffect(() => { if (transactions[0]?.origin) setPage(0); }, [transactions[0]?.id]);
  // Filter & sort logic
  const filteredTransactions = useMemo(() => {
    const live = transactions.filter(tx => Boolean(tx.origin));
    const historical = transactions.filter(tx => !Boolean(tx.origin));
    const filtered = historical
      .filter((tx) => {
        if (selectedRail !== "ALL" && tx.rail !== selectedRail) return false;
        if (selectedAccount !== "ALL" && tx.accountId !== selectedAccount)
          return false;
        if (selectedStatus !== "ALL" && tx.status !== selectedStatus)
          return false;
        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          const matchNarration = tx.rawNarration.toLowerCase().includes(q);
          const matchCleaned = tx.cleanedNarration.toLowerCase().includes(q);
          const matchVendor = tx.vendorClientName.toLowerCase().includes(q);
          const matchCategory = tx.category.toLowerCase().includes(q);
          const matchGstin = tx.gstin?.toLowerCase().includes(q);
          if (
            !matchNarration &&
            !matchCleaned &&
            !matchVendor &&
            !matchCategory &&
            !matchGstin
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === "date") {
          valA = new Date(a.date).getTime();
          valB = new Date(b.date).getTime();
        }
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    if (cfo?.ledgerFilter) {
      const lookup = new Map(transactions.map(t => [t.id,t]));
      return cfo.ledgerFilter.ids.flatMap(id => lookup.has(id) ? [lookup.get(id)!] : []);
    }
    return [...live, ...filtered];
  }, [
    cfo,
    transactions,
    selectedRail,
    selectedAccount,
    selectedStatus,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  const toggleSort = (field: "date" | "amount" | "confidence") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    sound.playPluck(0.3, 0.4);
    if (onTriggerPluck) onTriggerPluck(0.3);
  };

  const toggleRow = (id: string) => {
    const isNowOpen = expandedRowId !== id;
    setExpandedRowId(isNowOpen ? id : null);
    sound.playPluck(0.7, 0.35);
    if (onTriggerPluck) onTriggerPluck(0.7);
  };

  return (
    <div id="cfo-ledger" className="w-full flex flex-col bg-black text-slate-100 min-h-screen">
      <section className="border-b border-white/15 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center">
            {/* Search Input with Silver Metallic Outline */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search raw statement line, vendor, GSTIN, or UTR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs font-mono bg-zinc-900/60 border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-white backdrop-blur-xl transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Segmented Controls with Silver Outline */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {/* Rail Filter with wireframe active pill */}
              <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-white/20 backdrop-blur-xl">
                <span className="text-[10px] text-slate-400 px-1 uppercase">
                  Rail:
                </span>
                {(["ALL", "NEFT", "RTGS", "UPI", "IMPS", "NACH"] as const).map(
                  (rail) => {
                    const isActive = selectedRail === rail;
                    return (
                      <button
                        key={rail}
                        onClick={() => {
                          setSelectedRail(rail);
                          sound.playPluck(0.4, 0.25);
                        }}
                        className="relative px-2.5 py-1 text-[11px] rounded-lg transition-all duration-200 cursor-pointer select-none hover:bg-white hover:text-black group"
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeRailPill"
                            className="absolute inset-0 bg-white/20 border border-white/50 rounded-lg backdrop-blur-xl shadow-[0_0_15px_rgba(255,255,255,0.25)]"
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 30,
                            }}
                          />
                        )}
                        <span
                          className={`relative z-10 font-bold transition-colors ${isActive ? "text-white group-hover:text-black" : "text-slate-400 group-hover:text-black"}`}
                        >
                          {rail}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono bg-zinc-900/60 border border-white/20 rounded-xl text-slate-200 focus:outline-none focus:border-white backdrop-blur-xl"
              >
                <option value="ALL" className="bg-black text-white">
                  All Statuses
                </option>
                <option value="categorized" className="bg-black text-white">
                  Auto-Categorized
                </option>
                <option value="needs_review" className="bg-black text-white">
                  Needs Review
                </option>
                <option value="flagged_fraud" className="bg-black text-white">
                  Fraud Flagged
                </option>
              </select>

              {/* Account Filter */}
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono bg-zinc-900/60 border border-white/20 rounded-xl text-slate-200 focus:outline-none focus:border-white backdrop-blur-xl"
              >
                <option value="ALL" className="bg-black text-white">
                  All Bank Accounts
                </option>
                {Array.from(
                  new Map(
                    transactions.map((t) => [
                      t.accountId,
                      { name: t.bankName, number: t.accountNumber },
                    ]),
                  ).entries(),
                ).map(([id, a]) => (
                  <option key={id} value={id} className="bg-black text-white">
                    {a.name} ({a.number})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* High-Density Stream Table */}
      <section className="px-6 py-4 flex-1">
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Header Controls */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-white/15">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold tracking-wider">
                TRANSACTIONS
              </span>
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="px-2 disabled:opacity-30"
              >
                Previous
              </button>
              <span>
                {page + 1} /{" "}
                {Math.max(1, Math.ceil(filteredTransactions.length / 50))}
              </span>
              <button
                disabled={(page + 1) * 50 >= filteredTransactions.length}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 disabled:opacity-30"
              >
                Next
              </button>
              <span>·</span>
              <span className="text-slate-300 font-mono">
                {filteredTransactions.length} of {transactions.length} records
              </span>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-slate-500">SORT:</span>
              <button
                onClick={() => toggleSort("date")}
                className={`flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg transition-all duration-200 hover:bg-white hover:text-black hover:shadow-sm ${
                  sortField === "date" ? "text-white font-bold" : ""
                }`}
              >
                <span>Date</span>
                <ArrowUpDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => toggleSort("amount")}
                className={`flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg transition-all duration-200 hover:bg-white hover:text-black hover:shadow-sm ${
                  sortField === "amount" ? "text-white font-bold" : ""
                }`}
              >
                <span>Amount</span>
                <ArrowUpDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => toggleSort("confidence")}
                className={`flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg transition-all duration-200 hover:bg-white hover:text-black hover:shadow-sm ${
                  sortField === "confidence" ? "text-white font-bold" : ""
                }`}
              >
                <span>Confidence</span>
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Table Container with Glossy Silver Metal Frame */}
          <div className="overflow-x-auto border border-white/15 rounded-2xl bg-zinc-950/70 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.8)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-900/80 text-slate-300 font-mono text-[10px] uppercase tracking-widest border-b border-white/15">
                  <th className="py-3.5 px-3 w-8">#</th>
                  <th className="py-3.5 px-3">Date</th>
                  <th className="py-3.5 px-3">
                    Bank Statement Narration & Entity
                  </th>
                  <th className="py-3.5 px-3">Rail</th>
                  <th className="py-3.5 px-3">Category (CoA)</th>
                  <th className="py-3.5 px-3">Counterparty registration</th>
                  <th className="py-3.5 px-3 text-right">Amount (₹)</th>
                  <th className="py-3.5 px-3 text-center">Confidence</th>
                  <th className="py-3.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 font-mono">
                {filteredTransactions
                  .slice(page * 50, (page + 1) * 50)
                  .map((tx, idx) => {
                    const isExpanded = expandedRowId === tx.id;
                    const isFraud = tx.status === "flagged_fraud";

                    return (
                      <React.Fragment key={tx.id}>
                        <motion.tr
                          layout
                          onClick={() => toggleRow(tx.id)}
                          whileHover={{
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                          }}
                          className={`cursor-pointer transition-colors group ${cfo?.ledgerFilter?.ids.slice(0,3).includes(tx.id) ? "cfo-audit-row" : ""} ${
                            isFraud
                              ? "bg-red-950/20 text-white border-l-2 border-red-500"
                              : ""
                          } ${isExpanded ? "bg-zinc-900/60" : ""}`}
                        >
                          <td className="py-3 px-3 text-slate-500 text-[11px]">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            {formatDateIndian(tx.date)}
                          </td>

                          <td className="py-3 px-3 max-w-sm">
                            <div className="font-bold text-white truncate group-hover:text-slate-200 transition-colors">
                              {displayText(tx.vendorClientName)}
                            </div>
                            {(tx.recurring || !!tx.duplicateIds?.length) && (
                              <div className="flex gap-2 text-[10px] py-1">
                                <span className="text-slate-300">
                                  {tx.recurring ? "Recurring pattern" : ""}
                                </span>
                                {!!tx.duplicateIds?.length && (
                                  <span className="text-amber-300">
                                    Possible duplicate
                                  </span>
                                )}
                              </div>
                            )}
                            <div
                              className="text-[11px] text-slate-400 font-mono truncate"
                              title={displayText(tx.rawNarration)}
                            >
                              {displayText(tx.rawNarration)}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-850/80 text-slate-200 border border-white/20">
                              {tx.rail}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <div className="text-white font-sans font-medium">
                              {displayText(tx.category)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-sans">
                              {displayText(tx.subCategory)}
                            </div>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {tx.gstin ? (
                              <div>
                                <span className="font-mono text-slate-300">
                                  {tx.gstin}
                                </span>
                                <div className="text-[10px]">
                                  {tx.itcEligible ? (
                                    <span className="text-slate-200 font-semibold">
                                      Source supplied
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">
                                      Tax eligibility not assessed
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600 text-[11px]">
                                Not resolved
                              </span>
                            )}
                          </td>

                          {/* Liquid Silver Metallic Amount */}
                          <td className="py-3 px-3 text-right font-black tabular-nums whitespace-nowrap">
                            <span className="bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                              {tx.type === "credit" ? "+" : "-"}
                              {formatINR(tx.amount)}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isFraud ? (
                              <span className="inline-flex items-center gap-1 text-red-400 border border-red-500/40 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                                <AlertTriangle className="w-3 h-3 text-red-400" />
                                <span>FLAGGED</span>
                              </span>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <div className="w-14 bg-zinc-800/80 h-1.5 rounded-full overflow-hidden border border-white/20">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${tx.confidence}%` }}
                                    transition={{
                                      duration: 0.8,
                                      ease: "easeOut",
                                    }}
                                    className="h-full bg-white shadow-[0_0_8px_#ffffff]"
                                  />
                                </div>
                                <span className="text-[11px] text-slate-200 font-bold">
                                  {tx.confidence}%
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <motion.button
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(tx.id);
                              }}
                              className="p-1 hover:bg-white hover:text-black rounded-lg text-slate-400 cursor-pointer transition-colors duration-200"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-white hover:text-black" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </motion.button>
                          </td>
                        </motion.tr>

                        {/* Smooth Accordion Motion Expansion */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{
                                duration: 0.35,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="bg-zinc-900/70 border-y border-white/15"
                            >
                              <td
                                colSpan={9}
                                className="py-5 px-6 text-slate-300 font-sans"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                                  {/* Col 1 */}
                                  <div className="space-y-1.5 border-r border-white/15 pr-4">
                                    <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                                      Statement Narration
                                    </div>
                                    <div className="font-mono bg-black/60 p-2.5 rounded-xl text-[11px] text-slate-200 border border-white/15 break-all select-all">
                                      {displayText(tx.rawNarration)}
                                    </div>
                                    <div className="text-[11px] text-slate-400 pt-1">
                                      <span>Account: </span>
                                      <span className="text-white font-mono">
                                        {tx.bankName} {tx.accountNumber}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Col 2 */}
                                  <div className="space-y-1.5 border-r border-white/15 pr-4">
                                    <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                      <span>Classification Evidence</span>
                                      <span className="text-slate-200 font-mono font-semibold">
                                        {tx.citation.type}
                                      </span>
                                    </div>
                                    <p className="text-slate-200 text-xs leading-relaxed bg-black/40 p-2.5 rounded-xl border border-white/15">
                                      {displayText(tx.citation.explanation)}
                                    </p>
                                    {tx.citation.sourceDocument && (
                                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                                        <FileText className="w-3.5 h-3.5 text-slate-300" />
                                        <span>
                                          Source:{" "}
                                          <strong className="text-white font-mono">
                                            {displayText(tx.citation.sourceDocument)}
                                          </strong>
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Col 3 */}
                                  <div className="flex flex-col justify-between space-y-2">
                                    <div>
                                      <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                                        Record Details
                                      </div>
                                      <div className="mt-1 text-xs space-y-1">
                                        <div>
                                          TDS:{" "}
                                          <span className="font-mono text-white font-semibold">
                                            {tx.tdsSection || "N/A"}
                                          </span>
                                        </div>
                                        <div>
                                          Tax eligibility:{" "}
                                          <span className="font-mono text-slate-200">
                                            {"Not assessed by this application"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2">
                                      <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() =>
                                          onSelectTransactionForTrace(tx)
                                        }
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white text-black hover:bg-slate-200 rounded-xl transition-all duration-200 shadow-md hover:shadow-[0_4px_20px_rgba(255,255,255,0.4)] cursor-pointer font-bold group"
                                      >
                                        <Sparkles className="w-3.5 h-3.5 text-black" />
                                        <span>Decision Trace</span>
                                      </motion.button>

                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => onOpenSharePage(tx.id)}
                                        className="flex items-center justify-center p-2 text-xs bg-zinc-900/80 text-slate-200 hover:bg-white hover:text-black hover:border-white rounded-xl border border-white/20 cursor-pointer transition-all duration-200 hover:shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
                                        title="Share Record"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </motion.button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
