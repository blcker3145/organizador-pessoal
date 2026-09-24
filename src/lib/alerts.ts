/*
 * Avisos de prazo: junta o que está atrasado, vence hoje ou está chegando
 * (tarefas, criativos, vídeos, contas e compromissos) num único lugar.
 */
import { billPaid } from "./finance";
import { addDays, daysInMonth, diffDays, monthKey, relativeDate, today } from "./dates";
import { expandLocal } from "./calendar";
import { useMemo } from "react";
import { setState, appStore } from "./store";
import type { AlertSettings, AppState, ISODate } from "./types";
import { useApp } from "./store";

export type AlertLevel = "late" | "today" | "soon";
export type AlertKind = "task" | "creative" | "video" | "bill" | "event";

export interface Alert {
  /** o id muda de dia para dia, então um aviso lido volta a aparecer quando o prazo muda */
  id: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  /** "Atrasada 2 dias", "Hoje às 15:00"… */
  detail: string;
  date: ISODate;
  time: string;
  path: string;
}

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  task: "Tarefa",
  creative: "Criativo",
  video: "Vídeo",
  bill: "Conta",
  event: "Compromisso",
};

const levelOf = (date: ISODate, d0: ISODate): AlertLevel => (date < d0 ? "late" : date === d0 ? "today" : "soon");
const ORDER: Record<AlertLevel, number> = { late: 0, today: 1, soon: 2 };

function lateText(date: ISODate, d0: ISODate, feminino = false) {
  const days = diffDays(d0, date);
  if (days > 0) return `${feminino ? "Atrasada" : "Atrasado"} ${days} ${days === 1 ? "dia" : "dias"}`;
  return relativeDate(date);
}

/** Todos os avisos dentro da janela escolhida (em dias), do mais urgente para o menos. */
export function buildAlerts(state: AppState, now = new Date()): Alert[] {
  const d0 = today();
  const days = Math.max(0, state.alerts.days);
  const limit = addDays(d0, days);
  const out: Alert[] = [];
  const inWindow = (date: ISODate) => date <= limit;

  for (const t of state.tasks) {
    if (t.status === "done" || !t.date || !inWindow(t.date)) continue;
    out.push({ id: `task:${t.id}:${t.date}`, kind: "task", level: levelOf(t.date, d0), title: t.title || "Tarefa sem título", detail: lateText(t.date, d0, true), date: t.date, time: "", path: `/tarefas` });
  }

  for (const c of state.creatives) {
    if (!c.dueDate || c.dueDone || !inWindow(c.dueDate)) continue;
    const late = lateText(c.dueDate, d0);
    out.push({
      id: `creative:${c.id}:${c.dueDate}`,
      kind: "creative",
      level: levelOf(c.dueDate, d0),
      title: c.title || "Criativo sem título",
      detail: c.dueTime ? `${late} · ${c.dueTime}` : late,
      date: c.dueDate,
      time: c.dueTime,
      path: `/criativos/${c.id}`,
    });
  }

  for (const v of state.videos) {
    if (!v.publishDate || v.stage === "publicado" || !inWindow(v.publishDate)) continue;
    const late = lateText(v.publishDate, d0);
    out.push({
      id: `video:${v.id}:${v.publishDate}`,
      kind: "video",
      level: levelOf(v.publishDate, d0),
      title: v.title || "Vídeo sem título",
      detail: v.publishTime ? `${late} · ${v.publishTime}` : late,
      date: v.publishDate,
      time: v.publishTime,
      path: `/videos/${v.id}`,
    });
  }

  for (const bill of state.bills) {
    if (!bill.active) continue;
    const [y, m] = d0.split("-").map(Number);
    const day = String(Math.min(bill.day, daysInMonth(y, m - 1))).padStart(2, "0");
    const date = `${d0.slice(0, 7)}-${day}`;
    if (!inWindow(date) || billPaid(state, bill, monthKey(date))) continue;
    out.push({ id: `bill:${bill.id}:${date}`, kind: "bill", level: levelOf(date, d0), title: bill.name, detail: lateText(date, d0), date, time: "", path: "/financas" });
  }

  // compromissos do app (os do Google ficam na Agenda, que é quem avisa por lá)
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days + 1);
  for (const ev of expandLocal(state.events, from, to)) {
    if (!ev.allDay && ev.start < now) continue;
    const date = `${ev.start.getFullYear()}-${String(ev.start.getMonth() + 1).padStart(2, "0")}-${String(ev.start.getDate()).padStart(2, "0")}`;
    const time = ev.allDay ? "" : `${String(ev.start.getHours()).padStart(2, "0")}:${String(ev.start.getMinutes()).padStart(2, "0")}`;
    out.push({
      id: `event:${ev.key}`,
      kind: "event",
      level: levelOf(date, d0),
      title: ev.title || "Sem título",
      detail: time ? `${relativeDate(date)} às ${time}` : relativeDate(date),
      date,
      time,
      path: "/agenda",
    });
  }

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99") || a.title.localeCompare(b.title));
}

export function useAlerts() {
  const state = useApp();
  // só recalcula quando os dados mudam, não a cada desenho da tela
  const list = useMemo(() => buildAlerts(state), [state]);
  const read = new Set(state.alerts.read);
  return { list, unread: list.filter((a) => !read.has(a.id)).length, isRead: (a: Alert) => read.has(a.id) };
}

/** Marca avisos como lidos e esquece os ids que não existem mais. */
export function markAlertsRead(ids: string[]) {
  setState((s) => {
    const live = new Set(buildAlerts(s).map((a) => a.id));
    const read = [...new Set([...s.alerts.read, ...ids])].filter((id) => live.has(id));
    return { ...s, alerts: { ...s.alerts, read } };
  });
}

export function setAlertSettings(patch: Partial<AlertSettings>) {
  setState((s) => ({ ...s, alerts: { ...s.alerts, ...patch } }));
}

/* ---------- aviso no computador ---------- */

const notified = new Set<string>();

export async function enableDesktopAlerts(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
  setAlertSettings({ desktop: perm === "granted" });
  return perm === "granted";
}

/** Avisa uma vez por item enquanto o app estiver aberto (só atrasados e de hoje). */
export function checkDesktopAlerts() {
  const state = appStore.get();
  if (!state.alerts.desktop || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const read = new Set(state.alerts.read);
  for (const a of buildAlerts(state)) {
    if (a.level === "soon" || notified.has(a.id) || read.has(a.id)) continue;
    notified.add(a.id);
    try {
      new Notification(`${ALERT_KIND_LABEL[a.kind]}: ${a.title}`, { body: a.detail, icon: "favicon.svg", tag: a.id });
    } catch {
      /* navegador sem permissão ou sem suporte */
    }
  }
}
