import type { ISODate } from "./types";

export const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WEEKDAYS_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAYS_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
export const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today(): ISODate {
  return toISO(new Date());
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toISO(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

export function weekday(s: ISODate): number {
  return fromISO(s).getDay();
}

/** Semana começa na segunda-feira. */
export function startOfWeek(s: ISODate): ISODate {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function monthStart(key: string): ISODate {
  return `${key}-01`;
}

export function shiftMonthKey(key: string, n: number): string {
  return monthKey(addMonths(monthStart(key), n));
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS_LONG[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

export function monthDays(key: string): ISODate[] {
  const [y, m] = key.split("-").map(Number);
  const n = daysInMonth(y, m - 1);
  return Array.from({ length: n }, (_, i) => `${key}-${pad(i + 1)}`);
}

/** "15 set" */
export function shortDate(s: ISODate): string {
  const d = fromISO(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "15/09" */
export function numericDate(s: ISODate): string {
  const d = fromISO(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "terça, 15 de setembro" */
export function longDate(s: ISODate): string {
  const d = fromISO(s);
  const wd = WEEKDAYS_LONG[d.getDay()].replace("-feira", "");
  return `${wd}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

/** Hoje, Amanhã, Ontem, "qui, 17 set" */
export function relativeDate(s: ISODate): string {
  const diff = diffDays(s, today());
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff > 1 && diff < 7) return `${WEEKDAYS_SHORT[weekday(s)]}, ${shortDate(s)}`;
  return shortDate(s);
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Grade de calendário (semanas começando na segunda) para um mês. */
export function calendarGrid(key: string): ISODate[] {
  const first = monthStart(key);
  const start = startOfWeek(first);
  const days = monthDays(key);
  const last = days[days.length - 1];
  const total = diffDays(last, start) + 1;
  const cells = Math.ceil(total / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDays(start, i));
}
