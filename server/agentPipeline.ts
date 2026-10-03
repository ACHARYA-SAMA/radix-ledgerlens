import type { Transaction, TraceEvent } from "../src/types/finance.ts";
import { LIVE_PIPELINE_STAGES, type AgentMetadata, type LearningUpdate, type memorySnapshot } from "../shared/memory.ts";
import { isTransfer } from "../src/lib/analyticsMath.ts";
import { ServiceError } from "./errors.ts";
import { CATEGORIES, isCategory } from "../shared/categories.ts";

export const asObject = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
export function unpackAgentEnvelope(value: unknown) {
  const first = Array.isArray(value) && value.length === 1 ? value[0] : value;
  let envelope = asObject(first);
  if (envelope.data && !envelope.transaction && !envelope.tx && !envelope.agentMetadata) envelope = asObject(envelope.data);
  const transaction = asObject(envelope.transaction ?? envelope.tx ?? envelope);
  const id = transaction.id ?? envelope.transactionId ?? envelope.id;
  const metadata = transaction.agentMetadata ?? envelope.agentMetadata;
  return { envelope, transaction, id, metadata };
}
export function normalizeLiveInput(value: unknown): Record<string, any> {
  const { transaction: tx, id } = unpackAgentEnvelope(value);
  let category = tx.categoryId ?? tx.category;
  if (!isCategory(category)) category = Object.entries(CATEGORIES).find(([, label]) => label.toLowerCase() === String(category).toLowerCase())?.[0] ?? category;
  return { ...tx, id, requestId: tx.requestId ?? id, merchant: tx.merchant ?? tx.vendorClientName ?? tx.counterpartyText, direction: tx.direction ?? tx.type, category };
}
export function localAgentMetadata(tx: Transaction, learning: LearningUpdate, context: ReturnType<typeof memorySnapshot>): AgentMetadata {
  const ratio = context.merchantAvgSpend > 0 ? tx.amount / context.merchantAvgSpend : 1;
  const anomalyScore = isTransfer(tx) || tx.type === "credit" ? 0 : Math.min(100, Math.round(Math.max(0, ratio - 1) * 35));
  return { pipeline: "n8n-gemini-agent", enrichmentSource: "local", behaviorTag: isTransfer(tx) ? "internal-transfer" : tx.type === "credit" ? "income-opportunity" : anomalyScore >= 35 ? "above-usual-spending" : context.merchantVisitCount ? "repeat-merchant" : "new-merchant", anomalyScore,
    observedPattern: learning.observedPattern, budgetImpact: learning.velocityForecast,
    savingsRecommendation: { amount: learning.goalImpact?.microSweepAmount ?? 0, goalId: learning.goalImpact?.goalId ?? null, action: learning.goalImpact?.recovery ?? "No active savings goal; create one to plan an allocation." },
    rebalanceSuggestion: learning.rebalanceSuggestion, goalImpact: learning.goalImpact };
}
export function validateAgentMetadata(value: unknown, base: AgentMetadata = { pipeline: "n8n-gemini-agent", enrichmentSource: "local", behaviorTag: "pending", anomalyScore: 0, observedPattern: "Awaiting ledger context", budgetImpact: null, savingsRecommendation: null, rebalanceSuggestion: null, goalImpact: null }, source: "n8n" | "Gemini" = "n8n"): AgentMetadata {
  const raw = asObject(value);
  if (!Object.keys(raw).length) throw new ServiceError("agentMetadata must be an object.");
  const output = { ...base, enrichmentSource: source };
  let recognized = false;
  for (const key of ["behaviorTag", "observedPattern"] as const) if (raw[key] !== undefined) {
    if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > (key === "behaviorTag" ? 100 : 2000)) throw new ServiceError(`Invalid agentMetadata.${key}.`);
    output[key] = raw[key].trim(); recognized = true;
  }
  if (raw.anomalyScore !== undefined) {
    if (typeof raw.anomalyScore !== "number" || !Number.isFinite(raw.anomalyScore) || raw.anomalyScore < 0 || raw.anomalyScore > 100) throw new ServiceError("anomalyScore must be a number from 0 to 100.");
    output.anomalyScore = raw.anomalyScore; recognized = true;
  }
  for (const key of ["budgetImpact", "savingsRecommendation", "rebalanceSuggestion", "goalImpact"] as const) if (Object.hasOwn(raw, key)) {
    const json = JSON.stringify(raw[key]);
    if (!json || json.length > 6000 || (typeof raw[key] !== "string" && typeof raw[key] !== "object")) throw new ServiceError(`Invalid agentMetadata.${key}.`);
    output[key] = JSON.parse(json); recognized = true;
  }
  if (!recognized) throw new ServiceError("No recognized behavioral fields in agentMetadata.");
  return output;
}
export function livePipelineTrace(tx: Transaction, learning: LearningUpdate, context: ReturnType<typeof memorySnapshot>): TraceEvent[] {
  const agent = tx.agentMetadata!;
  const source = agent.enrichmentSource === "local" ? "Local deterministic fallback" : agent.enrichmentSource;
  const reasons = [
    "Account, amount and date validated. Account numbers stay local; merchant and category velocity are prepared for context.",
    `${context.merchantVisitCount} prior merchant visits; pre-transaction average INR ${context.merchantAvgSpend.toFixed(2)}. SQLite memory injected before enrichment.`,
    `${source}: ${agent.observedPattern}${agent.enrichmentSource === "local" ? " External Gemini/n8n completion is not required for this immediate result." : ""}`,
    `${agent.behaviorTag}; anomaly indicator ${agent.anomalyScore}/100. ${learning.velocityForecast ? `Estimated category month-end spend INR ${learning.velocityForecast.projectedMonthEndSpend}.` : "No expense budget affected."}`,
    learning.rebalanceSuggestion?.reason ?? learning.goalImpact?.recovery ?? "No eligible recovery or savings action at this time.",
    `Saved by transaction ID ${tx.id}; published to authenticated live clients. Repeated delivery updates enrichment without adding another ledger entry.`,
  ];
  return LIVE_PIPELINE_STAGES.map((stage, i) => ({ stage, status: "passed", source, reason: reasons[i] }));
}
