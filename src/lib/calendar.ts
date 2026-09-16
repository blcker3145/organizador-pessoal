/* Regras da Agenda: modelo único de evento, datas, repetição e layout. */
import { stageInfoLabel } from "./calendarLabels";
import type { AppState, LocalEvent, RepeatRule } from "./types";

export type EventSource = "google" | "local" | "task" | "video" | "creative";

export interface GAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
  organizer?: boolean;
  optional?: boolean;
}

export interface GEvent {
  id: string;
  calendarId: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: GAttendee[];
  organizer?: { email?: string; self?: boolean; displayName?: string };
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  eventType?: string;
}

export interface GCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor?: string;
  primary: boolean;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  selected: boolean;
  timeZone?: string;
}

export interface UiEvent {
  key: string;
  source: EventSource;
  calendarId: string;
  id: string;
  title: string;
  start: Date;
  /** fim exclusivo */
  end: Date;
  allDay: boolean;
  color: string;
  location?: string;
  description?: string;
  readOnly: boolean;
  recurring: boolean;
  google?: GEvent;
  local?: LocalEvent;
  /** caminho no app para itens de tarefas, vídeos e criativos */
  path?: string;
  done?: boolean;
}

/* ---------------- Constantes ---------------- */

export const LOCAL_CALENDAR_ID = "organizador";
export const APP_LAYERS: { id: string; label: string; color: string }[] = [
  { id: LOCAL_CALENDAR_ID, label: "Eventos do Organizador", color: "#7c6cd6" },
  { id: "app:tasks", label: "Tarefas com data", color: "#0b8043" },
  { id: "app:videos", label: "Publicação de vídeos", color: "#e67c73" },
  { id: "app:creatives", label: "Entrega de criativos", color: "#f4511e" },
];

/** Paleta de cores de evento do Google Agenda (colorId 1 a 11). */
export const GOOGLE_EVENT_COLORS: { id: string; name: string; hex: string }[] = [
  { id: "1", name: "Lavanda", hex: "#7986cb" },
  { id: "2", name: "Sálvia", hex: "#33b679" },
  { id: "3", name: "Uva", hex: "#8e24aa" },
  { id: "4", name: "Flamingo", hex: "#e67c73" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "6", name: "Tangerina", hex: "#f4511e" },
  { id: "7", name: "Pavão", hex: "#039be5" },
  { id: "8", name: "Grafite", hex: "#616161" },
  { id: "9", name: "Mirtilo", hex: "#3f51b5" },
  { id: "10", name: "Manjericão", hex: "#0b8043" },
  { id: "11", name: "Tomate", hex: "#d50000" },
];

export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

export function reminderLabel(min: number): string {
  if (min === 0) return "Na hora";
  if (min < 60) return `${min} minutos antes`;
  if (min < 1440) return `${min / 60} hora${min === 60 ? "" : "s"} antes`;
  if (min < 10080) return `${min / 1440} dia${min === 1440 ? "" : "s"} antes`;
  return `${min / 10080} semana${min === 10080 ? "" : "s"} antes`;
}

export const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

/* ---------------- Datas ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const localDateTime = (d: Date) => `${ymd(d)}T${hm(d)}`;

export function parseLocal(s: string): Date {
  const [date, time] = s.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDaysDate = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);
export const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
export const startOfWeekDate = (d: Date) => addDaysDate(startOfDay(d), -((d.getDay() + 7) % 7));
export const startOfMonthDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** Quantos minutos do dia o evento ocupa (para o layout da grade). */
export function minutesInDay(ev: UiEvent, day: Date): { top: number; bottom: number } | null {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 86_400_000;
  const s = Math.max(ev.start.getTime(), dayStart);
  const e = Math.min(ev.end.getTime(), dayEnd);
  if (e <= s && !(ev.start.getTime() === ev.end.getTime() && ev.start.getTime() >= dayStart && ev.start.getTime() < dayEnd)) return null;
  return { top: (s - dayStart) / 60_000, bottom: Math.max((e - dayStart) / 60_000, (s - dayStart) / 60_000 + 15) };
}

export function occursOn(ev: UiEvent, day: Date): boolean {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 86_400_000;
  if (ev.start.getTime() === ev.end.getTime()) return ev.start.getTime() >= dayStart && ev.start.getTime() < dayEnd;
  return ev.start.getTime() < dayEnd && ev.end.getTime() > dayStart;
}

/** Evento que aparece na faixa de "dia inteiro" (inclui eventos com mais de 24 h). */
export const isAllDayLike = (ev: UiEvent) => ev.allDay || ev.end.getTime() - ev.start.getTime() >= 86_400_000;

export function formatRange(ev: UiEvent): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
  const dayLabel = (d: Date) => d.toLocaleDateString("pt-BR", opts);
  if (ev.allDay) {
    const last = addDaysDate(ev.end, -1);
    return sameDay(ev.start, last) ? dayLabel(ev.start) : `${dayLabel(ev.start)} – ${dayLabel(last)}`;
  }
  if (sameDay(ev.start, ev.end) || ev.end.getTime() - ev.start.getTime() < 60_000) return `${dayLabel(ev.start)} · ${hm(ev.start)} – ${hm(ev.end)}`;
  return `${dayLabel(ev.start)}, ${hm(ev.start)} – ${dayLabel(ev.end)}, ${hm(ev.end)}`;
}

/* ---------------- Repetição ---------------- */

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function repeatLabel(rule: RepeatRule, start: Date): string {
  switch (rule) {
    case "daily":
      return "Todos os dias";
    case "weekdays":
      return "Todos os dias úteis (segunda a sexta)";
    case "weekly":
      return `Semanal: cada ${WEEKDAY_NAMES[start.getDay()]}`;
    case "monthly":
      return `Mensal: todo dia ${start.getDate()}`;
    case "yearly":
      return `Anual: em ${start.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}`;
    default:
      return "Não se repete";
  }
}

export function toRRule(rule: RepeatRule, start: Date, until: string | null): string[] | undefined {
  if (rule === "none") return undefined;
  const untilPart = until ? `;UNTIL=${until.replace(/-/g, "")}T235959Z` : "";
  const map: Record<Exclude<RepeatRule, "none">, string> = {
    daily: "FREQ=DAILY",
    weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    weekly: `FREQ=WEEKLY;BYDAY=${BYDAY[start.getDay()]}`,
    monthly: `FREQ=MONTHLY;BYMONTHDAY=${start.getDate()}`,
    yearly: "FREQ=YEARLY",
  };
  return [`RRULE:${map[rule]}${untilPart}`];
}

/** Lê uma RRULE do Google; "custom" quando não é um dos padrões do editor. */
export function fromRRule(recurrence: string[] | undefined): { rule: RepeatRule | "custom"; until: string | null } {
  const line = (recurrence || []).find((r) => r.startsWith("RRULE:"));
  if (!line) return { rule: "none", until: null };
  const parts = Object.fromEntries(line.slice(6).split(";").map((p) => p.split("=") as [string, string]));
  const untilRaw = parts.UNTIL;
  const until = untilRaw ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}` : null;
  const extra = Object.keys(parts).filter((k) => !["FREQ", "BYDAY", "BYMONTHDAY", "UNTIL", "WKST"].includes(k));
  if (extra.length) return { rule: "custom", until };
  if (parts.FREQ === "DAILY" && !parts.BYDAY) return { rule: "daily", until };
  if (parts.FREQ === "WEEKLY" && parts.BYDAY === "MO,TU,WE,TH,FR") return { rule: "weekdays", until };
  if (parts.FREQ === "WEEKLY" && parts.BYDAY && !parts.BYDAY.includes(",")) return { rule: "weekly", until };
  if (parts.FREQ === "MONTHLY" && !parts.BYDAY) return { rule: "monthly", until };
  if (parts.FREQ === "YEARLY" && !parts.BYDAY) return { rule: "yearly", until };
  return { rule: "custom", until };
}

function nextOccurrence(rule: RepeatRule, d: Date, anchorDay: number): Date {
  switch (rule) {
    case "daily":
      return addDaysDate(d, 1);
    case "weekdays": {
      let n = addDaysDate(d, 1);
      while (n.getDay() === 0 || n.getDay() === 6) n = addDaysDate(n, 1);
      return n;
    }
    case "weekly":
      return addDaysDate(d, 7);
    case "monthly": {
      // meses sem o dia (ex.: 31) são pulados, como no Google
      let y = d.getFullYear();
      let m = d.getMonth() + 1;
      for (;;) {
        const last = new Date(y, m + 1, 0).getDate();
        if (anchorDay <= last) return new Date(y, m, anchorDay, d.getHours(), d.getMinutes());
        m++;
        if (m > 11) {
          m = 0;
          y++;
        }
      }
    }
    case "yearly":
      return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
    default:
      return d;
  }
}

/** Expande os eventos locais (com repetição) dentro do intervalo. */
export function expandLocal(events: LocalEvent[], from: Date, to: Date): UiEvent[] {
  const out: UiEvent[] = [];
  for (const ev of events) {
    const start = parseLocal(ev.start);
    let end = parseLocal(ev.end);
    if (ev.allDay) end = addDaysDate(startOfDay(end), 1);
    const duration = Math.max(0, end.getTime() - start.getTime());
    const until = ev.repeatUntil ? addDaysDate(parseLocal(ev.repeatUntil), 1) : null;
    let occ = start;
    let guard = 0;
    if (ev.repeat !== "none") {
      // avança rápido até perto do intervalo
      while (occ.getTime() + duration < from.getTime() && guard < 5000) {
        occ = nextOccurrence(ev.repeat, occ, start.getDate());
        guard++;
      }
    }
    do {
      if (until && occ >= until) break;
      const occEnd = new Date(occ.getTime() + duration);
      if (occ < to && (occEnd > from || (duration === 0 && occ >= from))) {
        out.push({
          key: `local:${ev.id}:${occ.getTime()}`,
          source: "local",
          calendarId: LOCAL_CALENDAR_ID,
          id: ev.id,
          title: ev.title || "(Sem título)",
          start: occ,
          end: occEnd,
          allDay: ev.allDay,
          color: ev.color || APP_LAYERS[0].color,
          location: ev.location,
          description: ev.description,
          readOnly: false,
          recurring: ev.repeat !== "none",
          local: ev,
        });
      }
      if (ev.repeat === "none") break;
      occ = nextOccurrence(ev.repeat, occ, start.getDate());
      guard++;
    } while (occ < to && guard < 5000);
  }
  return out;
}

/** Itens do app com data (tarefas, vídeos, criativos) como eventos de dia inteiro. */
export function appItemsAsEvents(state: AppState, from: Date, to: Date): UiEvent[] {
  const inRange = (date: string) => {
    const d = parseLocal(date);
    return d >= startOfDay(from) && d < to;
  };
  const allDay = (date: string) => {
    const s = parseLocal(date);
    return { start: s, end: addDaysDate(s, 1) };
  };
  const out: UiEvent[] = [];
  for (const t of state.tasks) {
    if (!t.date || !inRange(t.date)) continue;
    out.push({ key: `task:${t.id}`, source: "task", calendarId: "app:tasks", id: t.id, title: t.title || "Tarefa sem título", ...allDay(t.date), allDay: true, color: APP_LAYERS[1].color, readOnly: true, recurring: false, done: t.status === "done" });
  }
  for (const v of state.videos) {
    if (!v.publishDate || !inRange(v.publishDate)) continue;
    const start = parseLocal(`${v.publishDate}T${v.publishTime || "18:00"}`);
    out.push({ key: `video:${v.id}`, source: "video", calendarId: "app:videos", id: v.id, title: `🎬 ${v.title || "Vídeo"}`, start, end: addMinutes(start, 30), allDay: false, color: APP_LAYERS[2].color, readOnly: true, recurring: false, path: `/videos/${v.id}`, done: v.stage === "publicado", description: `Etapa: ${stageInfoLabel(v.stage)}` });
  }
  for (const c of state.creatives) {
    if (!c.dueDate || !inRange(c.dueDate)) continue;
    out.push({ key: `creative:${c.id}`, source: "creative", calendarId: "app:creatives", id: c.id, title: `🎨 ${c.title || "Criativo"}`, ...allDay(c.dueDate), allDay: true, color: APP_LAYERS[3].color, readOnly: true, recurring: false, path: `/criativos/${c.id}`, done: c.stage === "entregue" });
  }
  return out;
}

/* ---------------- Google → modelo único ---------------- */

export function googleToUi(ev: GEvent, calendars: GCalendar[]): UiEvent | null {
  if (ev.status === "cancelled" || !ev.start || !ev.end) return null;
  const cal = calendars.find((c) => c.id === ev.calendarId);
  const allDay = !!ev.start.date;
  const start = allDay ? parseLocal(ev.start.date!) : new Date(ev.start.dateTime!);
  const end = allDay ? parseLocal(ev.end.date!) : new Date(ev.end.dateTime!);
  const color = (ev.colorId && GOOGLE_EVENT_COLORS.find((c) => c.id === ev.colorId)?.hex) || cal?.backgroundColor || "#039be5";
  const canEdit = (cal?.accessRole === "owner" || cal?.accessRole === "writer") && ev.eventType !== "birthday" && ev.eventType !== "fromGmail";
  return {
    key: `google:${ev.calendarId}:${ev.id}`,
    source: "google",
    calendarId: ev.calendarId,
    id: ev.id,
    title: ev.summary || "(Sem título)",
    start,
    end,
    allDay,
    color,
    location: ev.location,
    description: ev.description,
    readOnly: !canEdit,
    recurring: !!ev.recurringEventId || !!ev.recurrence?.length,
    google: ev,
  };
}

export function meetLink(ev: GEvent | undefined): string | undefined {
  return ev?.hangoutLink || ev?.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
}

/* ---------------- Layout de sobreposição (colunas) ---------------- */

export interface Placed {
  ev: UiEvent;
  top: number;
  height: number;
  col: number;
  cols: number;
}

export function layoutDay(events: UiEvent[], day: Date): Placed[] {
  const items = events
    .map((ev) => ({ ev, span: minutesInDay(ev, day) }))
    .filter((x): x is { ev: UiEvent; span: { top: number; bottom: number } } => !!x.span)
    .sort((a, b) => a.span.top - b.span.top || b.span.bottom - a.span.bottom);

  const placed: Placed[] = [];
  let group: { item: (typeof items)[number]; col: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    group.forEach((g) => placed.push({ ev: g.item.ev, top: g.item.span.top, height: g.item.span.bottom - g.item.span.top, col: g.col, cols }));
    group = [];
  };
  for (const item of items) {
    if (group.length && item.span.top >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.item.span.bottom > item.span.top).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ item, col });
    groupEnd = Math.max(groupEnd, item.span.bottom);
  }
  if (group.length) flush();
  return placed;
}
