import { LedgerService, type LedgerService as LedgerServiceType } from "./service.ts";
import type { Transaction } from "../src/types/finance.ts";
import type { PlanningState } from "../shared/planning.ts";
import { deriveMemory, memorySnapshot, learnTransaction, type PreferenceRule, type LearningUpdate } from "../shared/memory.ts";
import { localAgentMetadata, livePipelineTrace, unpackAgentEnvelope, normalizeLiveInput, validateAgentMetadata } from "./agentPipeline.ts";
import { getPlanning } from "./personalFinance.ts";
import { ServiceError } from "./errors.ts";

export const ledgerRows = (service: LedgerServiceType) => [...(service.snapshot?.transactions ?? []), ...service.store.all<Transaction>("live-transaction")];
export function rebuildMemory(service: LedgerService, plan: PlanningState, rule?: PreferenceRule) {
  const rows = ledgerRows(service);
  const asOf = rows.map(t => t.date).sort().at(-1) ?? service.snapshot?.dataDate;
  if (!asOf) return null;
  const prior = service.store.memory();
  const memory = deriveMemory(rows, plan, asOf, prior);
  if (rule) {
    memory.preferenceRules = [...memory.preferenceRules.filter(r => r.id !== rule.id), rule].slice(-100);
    memory.learnedTraits = deriveMemory(rows, plan, asOf, memory).learnedTraits;
  }
  service.store.saveMemory(memory);
  return memory;
}
export function prepareLearning(service: LedgerService, plan: PlanningState, tx: Transaction) {
  const rows = ledgerRows(service);
  const prior = service.store.memory() ?? deriveMemory(rows, plan, rows.map(t => t.date).sort().at(-1) ?? tx.date);
  const snapshot = memorySnapshot(prior, rows, plan, tx);
  const update = learnTransaction(tx, snapshot, [...rows, tx], plan);
  const memory = deriveMemory([...rows, tx], plan, [prior.asOf, tx.date].sort().at(-1)!, prior);
  memory.learningUpdates = [update, ...prior.learningUpdates].slice(0, 30);
  return { snapshot, update, memory };
}

// Only narrative enrichment is accepted from AI. Ledger-derived numbers and actions remain authoritative.
export function validatedEnrichment(value: unknown, id?: string): string | null {
  const v = value as { transactionId?: unknown; learningUpdate?: { explanation?: unknown; transactionId?: unknown } } | null;
  if ((v?.transactionId !== undefined && v.transactionId !== id) || (v?.learningUpdate?.transactionId !== undefined && v.learningUpdate.transactionId !== id)) return null;
  const explanation = v?.learningUpdate?.explanation;
  return typeof explanation === "string" && explanation.trim().length >= 10 && explanation.length <= 1200 ? explanation.trim() : null;
}
export async function enrichLearning(service: LedgerService, id: string, source: "phone" | "n8n", fetcher: typeof fetch = fetch) {
  const team = service.store.team;
  const tx = service.store.get<Transaction>("live-transaction", id);
  const context = service.store.get<ReturnType<typeof memorySnapshot>>("learning-context", id);
  const local = service.store.get<LearningUpdate>("learning-update", id) ?? service.store.memory()?.learningUpdates.find(u => u.transactionId === id);
  if (!tx || !context || !local) return;
  const payload = { event: "ledgerlens.learning.request", version: 1, model: service.gemini.model, transaction: { id: tx.id, date: tx.date, merchant: tx.vendorClientName, amount: tx.amount, direction: tx.type, type: tx.type, category: tx.categoryId, categoryId: tx.categoryId, accountId: tx.accountId, rail: tx.rail, requestId: tx.requestId ?? tx.id, goalId: tx.goalId, origin: source, agentMetadata: tx.agentMetadata }, memorySnapshot: context, learningUpdate: local };
  let explanation: string | null = null;
  let provider: LearningUpdate["source"] = "Built-in analysis";
  const urls = [...new Set([service.n8nWebhookUrl, LedgerService.n8nProductionWebhook, LedgerService.n8nTestWebhook])];
  if (urls.length) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-LedgerLens-Event": "learning.request" };
      const responses = await Promise.allSettled(urls.map(async url => {
        const target = new URL(url);
        if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))) throw new Error("Use HTTPS for remote n8n webhooks");
        const controller = new AbortController();
        return bounded(async () => {
          const r = await fetcher(url, { method: "POST", redirect: "error", headers, signal: controller.signal, body: JSON.stringify(payload) });
          if (!r.ok) throw new Error("n8n unavailable");
          return r.json();
        }, controller);
      }));
      for (const result of responses) if (result.status === "fulfilled") {
        const inline = unpackAgentEnvelope(result.value);
        if (inline.metadata) {
          if (inline.id !== undefined && inline.id !== id) continue;
          if (service.store.team === team) receiveLearningCallback(service, { transactionId: id, agentMetadata: inline.metadata });
          return;
        }
        explanation ??= validatedEnrichment(result.value, id);
      }
      if (explanation) provider = "n8n";
    } catch { /* Local learning is already saved and visible. */ }
  }
  if (!explanation && service.gemini.key) {
    try {
      explanation = validatedEnrichment(await bounded(() => service.gemini.learning(payload), new AbortController()), id);
      if (explanation) provider = "Gemini";
    } catch { /* Deterministic fallback requires no network. */ }
  }
  if (service.store.team !== team) return;
  const memory = service.store.memory();
  const latest = service.store.get<Transaction>("live-transaction", id);
  const update = service.store.get<LearningUpdate>("learning-update", id) ?? memory?.learningUpdates.find(u => u.transactionId === id);
  // A human correction made during inference takes precedence over stale context.
  if (!memory || !latest || !update || latest.subCategory === "Human review" || latest.categoryId !== tx.categoryId || latest.status !== tx.status) return;
  if (update.source === "n8n" && provider !== "n8n") return;
  if (explanation) update.explanation = explanation;
  update.source = provider;
  update.pipeline = { status: explanation ? "complete" : "fallback", message: explanation ? `Context enrichment completed with ${provider}. Calculated amounts remain ledger-derived.` : urls.length ? "External enrichment unavailable or invalid; built-in learning retained." : "n8n is not configured; built-in learning is active." };
  memory.revision++; memory.updatedAt = new Date().toISOString();
  latest.agentMetadata ??= localAgentMetadata(latest, update, context);
  if (explanation) latest.agentMetadata.enrichmentSource = provider === "n8n" ? "n8n" : "Gemini";
  update.agentMetadata = latest.agentMetadata;
  latest.trace = livePipelineTrace(latest, update, context);
  memory.learningUpdates = memory.learningUpdates.map(u => u.transactionId === id ? update : u);
  service.store.atomic(() => { service.store.saveMemory(memory); service.store.upsertLiveTransaction(latest); service.store.put("learning-update", id, update); });
  service.events.emit("changed");
}
export function receiveLearningCallback(service: LedgerService, input: unknown) {
  const { envelope, transaction, id, metadata } = unpackAgentEnvelope(input);
  if (!service.ready || !service.store.team) throw new ServiceError("Sync the bank feed first.", 409);
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new ServiceError("A valid transactionId is required for a learning callback.");
  const tx = service.store.get<Transaction>("live-transaction", id);
  const memory = service.store.memory();
  const update = service.store.get<LearningUpdate>("learning-update", id) ?? memory?.learningUpdates.find(u => u.transactionId === id);
  if (!tx || !memory || !update) throw new ServiceError("Learning transaction unavailable; send the complete transaction when delivering to another instance.", 404);
  if (tx.subCategory === "Human review") throw new ServiceError("A human reviewed this entry; the original learning context is stale.", 409);
  const submitted = normalizeLiveInput(transaction);
  for (const [field, expected] of [["amount", tx.amount], ["date", tx.date], ["accountId", tx.accountId], ["direction", tx.type], ["rail", tx.rail], ["merchant", tx.vendorClientName]] as const) {
    if (submitted[field] !== undefined && submitted[field] !== expected) throw new ServiceError("Transaction ID conflicts with existing financial facts.", 409);
  }
  const context = service.store.get<ReturnType<typeof memorySnapshot>>("learning-context", id) ?? memorySnapshot(memory, ledgerRows(service).filter(t => t.id !== id), getPlanning(service), tx);
  const base = tx.agentMetadata ?? localAgentMetadata(tx, update, context);
  const explanation = validatedEnrichment({ ...envelope, transactionId: id }, id);
  if (!metadata && !explanation) throw new ServiceError("Return agentMetadata or learningUpdate.explanation with 10–1200 characters for this transaction.");
  const agent = metadata ? validateAgentMetadata(metadata, base) : { ...base, enrichmentSource: "n8n" as const };
  if (update.source === "n8n" && JSON.stringify(base) === JSON.stringify(agent) && (!explanation || update.explanation === explanation)) return { id, duplicate: true, status: "learning_updated" };
  tx.agentMetadata = agent; update.agentMetadata = agent;
  if (explanation) update.explanation = explanation;
  if (metadata) update.observedPattern = agent.observedPattern;
  update.source = "n8n";
  update.pipeline = { status: "complete", message: "n8n enrichment received. Actions use recalculated ledger amounts." };
  memory.revision++; memory.updatedAt = new Date().toISOString();
  memory.learningUpdates = memory.learningUpdates.map(u => u.transactionId === id ? update : u);
  tx.trace = livePipelineTrace(tx, update, context);
  service.store.atomic(() => { service.store.saveMemory(memory); service.store.upsertLiveTransaction(tx); service.store.put("learning-update", id, update); });
  service.events.emit("changed");
  return { id, duplicate: false, status: "learning_updated" };
}
async function bounded<T>(operation: () => Promise<T>, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Learning timed out")); }, 3500); })]); }
  finally { clearTimeout(timer!); }
}
