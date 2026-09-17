/* Pomodoro: cronômetro global (continua ao trocar de página), ciclos e histórico. */
import { useEffect, useState } from "react";
import { stopAmbient, startAmbient, playChime } from "./ambient";
import { createStore } from "./createStore";
import { today } from "./dates";
import { appStore, setState } from "./store";
import type { PomodoroMode, PomodoroPrefs } from "./types";
import { uid } from "./util";

export const MODE_LABEL: Record<PomodoroMode, string> = { focus: "Foco", short: "Pausa curta", long: "Pausa longa" };

export interface TimerState {
  mode: PomodoroMode;
  status: "idle" | "running" | "paused";
  /** fim previsto (ms desde 1970) quando está rodando */
  endAt: number;
  /** tempo que falta (ms) quando está pausado ou parado */
  remaining: number;
  /** duração total da etapa atual (ms) */
  duration: number;
  /** focos concluídos no ciclo atual */
  cycle: number;
  taskId: string | null;
  /** tela cheia com o líquido */
  immersive: boolean;
}

const prefs = (): PomodoroPrefs => appStore.get().pomodoroPrefs;
const minutesOf = (mode: PomodoroMode) => {
  const p = prefs();
  return mode === "focus" ? p.focus : mode === "short" ? p.short : p.long;
};

export const timerStore = createStore<TimerState>({
  mode: "focus",
  status: "idle",
  endAt: 0,
  remaining: 25 * 60_000,
  duration: 25 * 60_000,
  cycle: 0,
  taskId: null,
  immersive: false,
});
export const useTimer = timerStore.use;
const set = (p: Partial<TimerState>) => timerStore.set((s) => ({ ...s, ...p }));

export const timeLeft = (s: TimerState, now = Date.now()) => (s.status === "running" ? Math.max(0, s.endAt - now) : s.remaining);

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ---------- relógio ---------- */

let ticker: number | undefined;
const baseTitle = typeof document !== "undefined" ? document.title : "Organizador";

function tick() {
  const s = timerStore.get();
  if (s.status !== "running") return;
  const left = s.endAt - Date.now();
  document.title = `${formatClock(Math.max(0, left))} · ${MODE_LABEL[s.mode]}`;
  if (left <= 0) complete();
}

function ensureTicker() {
  if (ticker === undefined) ticker = window.setInterval(tick, 250);
}
function stopTicker() {
  window.clearInterval(ticker);
  ticker = undefined;
  document.title = baseTitle;
}

/* ---------- ações ---------- */

export function setMode(mode: PomodoroMode) {
  const ms = minutesOf(mode) * 60_000;
  stopTicker();
  stopAmbient();
  set({ mode, status: "idle", remaining: ms, duration: ms, endAt: 0 });
}

/** Aplica novas durações quando o cronômetro está parado. */
export function syncIdleDuration() {
  const s = timerStore.get();
  if (s.status !== "idle") return;
  const ms = minutesOf(s.mode) * 60_000;
  set({ remaining: ms, duration: ms });
}

export function start() {
  const s = timerStore.get();
  if (s.status === "running") return;
  const remaining = s.status === "idle" ? minutesOf(s.mode) * 60_000 : s.remaining;
  const duration = s.status === "idle" ? remaining : s.duration;
  set({ status: "running", endAt: Date.now() + remaining, remaining, duration, immersive: true });
  ensureTicker();
  askNotificationPermission();
  if (s.mode === "focus") startAmbient(prefs().sound, prefs().volume);
}

export function pause() {
  const s = timerStore.get();
  if (s.status !== "running") return;
  set({ status: "paused", remaining: Math.max(0, s.endAt - Date.now()) });
  stopTicker();
  stopAmbient();
}

export function toggle() {
  if (timerStore.get().status === "running") pause();
  else start();
}

export function reset() {
  setMode(timerStore.get().mode);
}

/** Pula para a próxima etapa sem registrar. */
export function skip() {
  const s = timerStore.get();
  advance(s.mode === "focus" ? s.cycle + 1 : s.cycle, false);
}

export function setTask(taskId: string | null) {
  set({ taskId });
}

export function setImmersive(immersive: boolean) {
  set({ immersive });
}

function nextMode(mode: PomodoroMode, cycle: number): PomodoroMode {
  if (mode !== "focus") return "focus";
  return cycle > 0 && cycle % Math.max(1, prefs().longEvery) === 0 ? "long" : "short";
}

function advance(cycle: number, autoStart: boolean) {
  const from = timerStore.get().mode;
  const mode = nextMode(from, cycle);
  setMode(mode);
  // depois da pausa longa começa um ciclo novo
  set({ cycle: from === "long" ? 0 : cycle });
  if (autoStart) start();
}

function complete() {
  const s = timerStore.get();
  stopTicker();
  stopAmbient();
  playChime(prefs().volume);
  let cycle = s.cycle;
  if (s.mode === "focus") {
    cycle += 1;
    const minutes = Math.round(s.duration / 60_000);
    setState((st) => ({
      ...st,
      pomodoroLog: [...st.pomodoroLog, { id: uid(), date: today(), endedAt: Date.now(), minutes, taskId: s.taskId }].slice(-2000),
    }));
  }
  notify(s.mode === "focus" ? "Foco concluído" : "Pausa terminada", s.mode === "focus" ? "Hora de uma pausa." : "Bora voltar ao foco.");
  advance(cycle, prefs().autoStart);
}

/* ---------- avisos ---------- */

function askNotificationPermission() {
  if (!prefs().notify || typeof Notification === "undefined") return;
  if (Notification.permission === "default") Notification.requestPermission().catch(() => undefined);
}

function notify(title: string, body: string) {
  if (!prefs().notify || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "favicon.svg", silent: true });
  } catch {
    /* alguns navegadores só permitem via service worker */
  }
}

/* ---------- consultas ---------- */

export function focusStats(dateISO = today()) {
  const log = appStore.get().pomodoroLog;
  const todays = log.filter((l) => l.date === dateISO);
  return { count: todays.length, minutes: todays.reduce((a, l) => a + l.minutes, 0) };
}

/** Relógio que atualiza a cada quadro enquanto o cronômetro roda. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      // ~30 quadros por segundo bastam para o líquido
      if (t - last > 33) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}
