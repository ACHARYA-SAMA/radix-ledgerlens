import type { AppState } from '../src/types/finance.ts';
import type { Category } from './categories.ts';
export type CfoResult = {
  id: string; answer: string; targetTab: 'goals' | 'dashboard' | 'decision_trace' | 'analytics';
  kind: 'rebalance' | 'simulation' | 'audit' | 'trace' | 'answer';
  highlightCategories: Category[]; protectedGoals: string[];
  rebalanceActions: { category: Category; name: string; before: number; after: number; amount: number }[];
  amount?: number; shortfall?: number; safeDailySpend?: number; provisional?: boolean;
  ledgerFilter?: { ids: string[]; label: string; monthSpend: number; average: number; burnRate: number; anomaly: number | null };
  goalSimulation?: { goalId?: string; goalName: string; delayDays: number | null; surplus: number; neutralizable: number; remainingDelay: number | null };
  transactionId?: string; stages?: { title: string; narration: string }[];
  state?: AppState;
};
export const CFO_COMMANDS = [
  'I have an urgent 12,000 rupee medical expense. Cover it from my lowest-priority budgets without touching my Emergency Fund.',
  'Can I afford fifteen thousand rupees for flight tickets without ruining my savings goals?',
  'Show me my food delivery burn rate and top dining anomalies',
  'Explain how the AI agent processed my last transaction',
];
