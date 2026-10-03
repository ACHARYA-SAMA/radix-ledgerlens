import { Brain, ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import { CATEGORIES } from "../../shared/categories.ts";
import { inr } from "../../shared/planning.ts";
import { displayText } from "../../shared/branding.ts";
import type { AgentMemory, LearningUpdate, adaptiveMetrics } from "../../shared/memory.ts";

type Metrics = ReturnType<typeof adaptiveMetrics>;
type Apply = (body: Record<string, unknown>) => void;

export function BudgetForecast({ budget, metrics, busy, onApply }: { budget: Metrics["budgets"][number]; metrics: Metrics; busy: boolean; onApply: Apply }) {
  const suggestion = metrics.rebalances.find(r => r.toCategory === budget.category);
  return <div className="budget-forecast"><p>Burn rate <strong>{inr(budget.dailyBurnRate)}/day</strong><span> · </span>Projected finish <strong>{inr(budget.projectedMonthEndSpend)} ({budget.projectedPercent.toFixed(0)}%)</strong></p>
    {budget.exhaustionDate && <p className="forecast-caution">Estimated limit date: {budget.exhaustionDate} · assumes the current pace continues</p>}
    {suggestion && <div className="adaptive-action"><p><Sparkles size={13} />Shift {inr(suggestion.suggestedAmount)} from {CATEGORIES[suggestion.fromCategory]} <ArrowRight size={12} /> {budget.name}</p><button disabled={busy} className="finance-button" onClick={() => onApply({ action: "rebalance", ...suggestion, amount: suggestion.suggestedAmount })}><Zap size={13} />AI Auto-Rebalance</button><small>Uses forecast surplus; total budget stays the same. May partially cover an overrun.</small></div>}
  </div>;
}

export function GoalForecast({ goal, metrics, learning, busy, onApply }: { goal: Metrics["goals"][number]; metrics: Metrics; learning?: LearningUpdate; busy: boolean; onApply: Apply }) {
  const impact = learning?.goalImpact?.goalId === goal.id ? learning.goalImpact : null;
  const priority = metrics.topGoal?.id === goal.id;
  return <div className="goal-forecast"><div><span>ESTIMATED COMPLETION</span><strong>{goal.projectedCompletionDate ?? "Waiting for positive savings"}</strong></div>
    {priority && <span className="finance-tag">PRIORITY GOAL</span>}
    <small>Historical net savings pace · goals funded in priority order.</small>
    {impact && impact.direction !== "neutral" && <p className={impact.direction === "delays" ? "forecast-caution" : ""}>{impact.days === null ? "Not enough positive savings to estimate the latest entry’s timeline effect." : `Latest entry ${impact.direction} this goal by an estimated ${impact.days} days.`}</p>}
    <div className="finance-actions">{impact?.direction === "delays" && <button disabled={busy} className="finance-button" onClick={() => onApply({ action: "daily-lock" })}><Shield size={13} />Apply Daily Spend Lock</button>}{priority && metrics.microSweepAmount > 0 && <button disabled={busy} className="finance-button" onClick={() => onApply({ action: "micro-sweep", id: goal.id, amount: metrics.microSweepAmount })}><Sparkles size={13} />Smart Micro-Sweep {inr(metrics.microSweepAmount)}</button>}</div>
    {(priority || impact?.direction === "delays") && <small>Planning allocations and advisory limits; no bank payments or blocks.</small>}
  </div>;
}

export function LearningDetail({ learning }: { learning: LearningUpdate }) {
  return <div className="learning-detail"><div className="memory-meta"><span className="finance-tag">{learning.source}</span><time dateTime={learning.createdAt}>{new Date(learning.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</time></div>
    {learning.agentMetadata && <div className="memory-meta"><span className="finance-tag">{displayText(learning.agentMetadata.behaviorTag)}</span><span>Anomaly indicator {learning.agentMetadata.anomalyScore}/100</span><span>{learning.agentMetadata.enrichmentSource === "local" ? "Immediate local analysis" : `${learning.agentMetadata.enrichmentSource} enrichment`}</span></div>}
    <p>{displayText(learning.observedPattern)}</p>
    {learning.explanation && <p className="learning-explanation">{displayText(learning.explanation)}</p>}
    {learning.velocityForecast && <p className="finance-hint">Estimated {inr(learning.velocityForecast.dailyBurnRate)}/day · {inr(learning.velocityForecast.projectedMonthEndSpend)} at month end{learning.velocityForecast.exhaustionDate ? ` · budget limit on ${learning.velocityForecast.exhaustionDate}` : ""}. Assumes unchanged pace.</p>}
    {learning.pipeline && <small>{learning.pipeline.message}</small>}
  </div>;
}

export function AgentMemoryPanel({ memory, metrics, busy, onApply }: { memory?: AgentMemory; metrics: Metrics; busy: boolean; onApply: Apply }) {
  const learning = memory?.learningUpdates[0];
  const suggestion = metrics.rebalances[0];
  return <section className="finance-card agent-memory-panel"><div className="finance-section-title"><div><div className="finance-eyebrow">CONTINUOUS LEARNING</div><h2><Brain size={22} />AI agent memory & learned habits</h2></div><span className="finance-tag"><span className="live-dot" />{memory?.transactionCount ?? 0} ledger entries</span></div>
    <p className="finance-hint">Your history provides the baseline. Each new entry adds context, while your saved choices guide future suggestions.</p>
    <div className="memory-layers">{[
      ["01", "Merchant episodes", `${memory?.merchantHistory.length ?? 0} counterparties`, "Visit frequency & average purchase"],
      ["02", "Behavioral patterns", `${memory?.learnedTraits.filter(t => t.kind !== "preference").length ?? 0} observations`, "Habits, drift & category flexibility"],
      ["03", "Your preferences", `${memory?.preferenceRules.length ?? 0} saved rules`, "Category choices, budgets & goals"],
      ["04", "Recent learning", `${memory?.learningUpdates.length ?? 0} live updates`, "Forecasts & goal timeline effects"],
    ].map(([number, title, value, hint]) => <article key={number}><span>{number}</span><h3>{title}</h3><strong>{value}</strong><small>{hint}</small></article>)}</div>
    <div className="memory-latest" key={learning?.transactionId ?? "initial"}><div className="finance-eyebrow">LATEST LIVE LEARNING</div>{learning ? <LearningDetail learning={learning} /> : <p className="finance-hint">Historical memory is ready. Send a phone or webhook transaction to see how it changes the agent’s understanding.</p>}</div>
    <div className="memory-recommendations">{suggestion && <button disabled={busy} className="finance-button" onClick={() => onApply({ action: "rebalance", ...suggestion, amount: suggestion.suggestedAmount })}><Zap size={14} />Rebalance {inr(suggestion.suggestedAmount)} to {CATEGORIES[suggestion.toCategory]}</button>}{metrics.topGoal && metrics.microSweepAmount > 0 && <button disabled={busy} className="finance-button" onClick={() => onApply({ action: "micro-sweep", id: metrics.topGoal!.id, amount: metrics.microSweepAmount })}><Sparkles size={14} />Plan {inr(metrics.microSweepAmount)} for {displayText(metrics.topGoal.name)}</button>}</div>
    <details className="memory-traits" open><summary>Learned behavioral traits & saved choices</summary><div>{[...(memory?.learnedTraits.filter(t => t.kind === "preference") ?? []).slice(-4), ...(memory?.learnedTraits.filter(t => t.kind !== "preference") ?? []).slice(0, 8)].map(trait => <article key={trait.id}><p>{displayText(trait.text)}</p><small>{trait.kind === "preference" ? "Explicit user preference" : trait.kind === "elasticity" ? "Planning heuristic" : `${Math.round(trait.confidence * 100)}% confidence · ${trait.sampleSize} observations`} · Updated {trait.updatedAt.slice(0, 10)}</small></article>)}</div></details>
  </section>;
}
