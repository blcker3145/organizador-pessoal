import { monthKey } from "./dates";
import type { AppState, Bill, Category, Goal } from "./types";

export function monthTransactions(state: AppState, key: string) {
  return state.transactions.filter((t) => monthKey(t.date) === key);
}

export function categoryLimit(state: AppState, cat: Category, key: string): number {
  const override = state.budgets[key]?.limits[cat.id];
  return override ?? cat.limit;
}

export interface MonthSummary {
  income: number;
  expenses: number;
  balance: number;
  budgetTotal: number;
  budgetSpent: number;
  budgetUsedPct: number;
  plannedIncome: number | null;
  byCategory: { cat: Category; limit: number; spent: number }[];
}

export function monthSummary(state: AppState, key: string): MonthSummary {
  const txs = monthTransactions(state, key);
  const income = txs.filter((t) => t.kind === "entrada").reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter((t) => t.kind === "saida").reduce((s, t) => s + t.amount, 0);
  const byCategory = state.categories
    .filter((c) => c.kind === "saida")
    .map((cat) => ({
      cat,
      limit: categoryLimit(state, cat, key),
      spent: txs.filter((t) => t.kind === "saida" && t.categoryId === cat.id).reduce((s, t) => s + t.amount, 0),
    }));
  const budgeted = byCategory.filter((c) => c.limit > 0);
  const budgetTotal = budgeted.reduce((s, c) => s + c.limit, 0);
  const budgetSpent = budgeted.reduce((s, c) => s + c.spent, 0);
  return {
    income,
    expenses,
    balance: income - expenses,
    budgetTotal,
    budgetSpent,
    budgetUsedPct: budgetTotal ? Math.round((budgetSpent / budgetTotal) * 100) : 0,
    plannedIncome: state.budgets[key]?.income ?? null,
    byCategory,
  };
}

export function billPaid(state: AppState, bill: Bill, key: string): boolean {
  return state.transactions.some((t) => t.billId === bill.id && monthKey(t.date) === key);
}

export function goalCurrent(state: AppState, goal: Goal): number {
  return goal.initial + state.transactions.filter((t) => t.goalId === goal.id).reduce((s, t) => s + t.amount, 0);
}

export function accountsUsed(state: AppState): string[] {
  const set = new Set<string>(["Nubank", "Itaú", "Débito", "Dinheiro", "Pix"]);
  state.transactions.forEach((t) => t.account && set.add(t.account));
  return [...set];
}

/** Data de vencimento de uma conta no mês, respeitando meses curtos. */
export function dueDate(key: string, day: number): string {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${key}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
