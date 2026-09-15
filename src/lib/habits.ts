import { addDays, monthDays, monthKey, startOfWeek, today, weekday } from "./dates";
import type { AppState, Habit, ISODate, Routine } from "./types";

export function habitValue(state: AppState, habitId: string, date: ISODate): number {
  return state.habitLogs[habitId]?.[date] || 0;
}

export function isHabitDone(state: AppState, habit: Habit, date: ISODate): boolean {
  const v = habitValue(state, habit.id, date);
  return habit.type === "bool" ? v > 0 : v >= habit.target;
}

/** Se o hábito é cobrado nesse dia (hábitos semanais contam todos os dias). */
export function isScheduled(habit: Habit, date: ISODate): boolean {
  if (habit.freq.kind === "days") return habit.freq.days.includes(weekday(date));
  return true;
}

export function freqLabel(habit: Habit): string {
  const f = habit.freq;
  if (f.kind === "daily") return "todo dia";
  if (f.kind === "weekly") return `${f.times}× por semana`;
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return f.days
    .slice()
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => names[d])
    .join(", ");
}

function weekDone(state: AppState, habit: Habit, weekStart: ISODate): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isHabitDone(state, habit, addDays(weekStart, i))) n++;
  return n;
}

/** Sequência atual: dias seguidos (ou semanas, para hábitos N× por semana). */
export function currentStreak(state: AppState, habit: Habit): { value: number; unit: "dia" | "semana" } {
  const now = today();
  const floor = addDays(now, -730);
  if (habit.freq.kind === "weekly") {
    const times = habit.freq.times;
    let ws = startOfWeek(now);
    let count = 0;
    if (weekDone(state, habit, ws) >= times) count++;
    ws = addDays(ws, -7);
    while (ws > floor && weekDone(state, habit, ws) >= times) {
      count++;
      ws = addDays(ws, -7);
    }
    return { value: count, unit: "semana" };
  }
  let d = now;
  let count = 0;
  if (isHabitDone(state, habit, d)) count++;
  d = addDays(d, -1);
  while (d > floor) {
    if (isScheduled(habit, d)) {
      if (!isHabitDone(state, habit, d)) break;
      count++;
    }
    d = addDays(d, -1);
  }
  return { value: count, unit: "dia" };
}

export function bestStreak(state: AppState, habit: Habit): number {
  const logs = state.habitLogs[habit.id] || {};
  const dates = Object.keys(logs).sort();
  if (!dates.length) return 0;
  let best = 0;
  let run = 0;
  let d = dates[0];
  const end = today();
  while (d <= end) {
    if (isScheduled(habit, d)) {
      if (isHabitDone(state, habit, d)) {
        run++;
        best = Math.max(best, run);
      } else if (d !== end) {
        run = 0;
      }
    }
    d = addDays(d, 1);
  }
  return best;
}

/** Percentual do mês até hoje. */
export function monthRate(state: AppState, habit: Habit, key = monthKey(today())): number {
  const now = today();
  const days = monthDays(key).filter((d) => d <= now);
  if (!days.length) return 0;
  if (habit.freq.kind === "weekly") {
    const done = days.filter((d) => isHabitDone(state, habit, d)).length;
    const expected = Math.max(1, Math.round((days.length / 7) * habit.freq.times));
    return Math.min(100, Math.round((done / expected) * 100));
  }
  const scheduled = days.filter((d) => isScheduled(habit, d));
  if (!scheduled.length) return 0;
  const done = scheduled.filter((d) => isHabitDone(state, habit, d)).length;
  return Math.round((done / scheduled.length) * 100);
}

export function routineTotalMinutes(r: Routine): number {
  return r.steps.reduce((sum, s) => sum + (s.minutes || 0), 0);
}
