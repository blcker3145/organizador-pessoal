/* Ações da Agenda: salvar, mover e excluir eventos do Google ou do Organizador. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDaysDate,
  appItemsAsEvents,
  expandLocal,
  fromRRule,
  GOOGLE_EVENT_COLORS,
  googleToUi,
  hm,
  LOCAL_CALENDAR_ID,
  meetLink,
  parseLocal,
  startOfDay,
  TIME_ZONE,
  toRRule,
  ymd,
  type GAttendee,
  type GEvent,
  type UiEvent,
} from "./calendar";
import { createEvent, deleteEvent, gcalStore, getEvent, listEvents, moveEvent, updateEvent, useGcal } from "./gcal";
import { appStore, insert, patch, remove, useApp } from "./store";
import type { LocalEvent, RepeatRule } from "./types";
import { uid } from "./util";

export type EditScope = "instance" | "all";

export interface EventDraft {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  calendarId: string;
  location: string;
  description: string;
  colorId: string;
  repeat: RepeatRule | "custom";
  repeatUntil: string;
  useDefaultReminders: boolean;
  reminders: number[];
  guests: string[];
  addMeet: boolean;
  transparency: "opaque" | "transparent";
  visibility: "default" | "public" | "private";
  sendInvites: boolean;
}

export function newDraft(start: Date, end: Date, allDay: boolean, calendarId: string): EventDraft {
  return {
    title: "",
    allDay,
    startDate: ymd(start),
    startTime: hm(start),
    endDate: ymd(allDay ? addDaysDate(end, -1) : end),
    endTime: hm(end),
    calendarId,
    location: "",
    description: "",
    colorId: "",
    repeat: "none",
    repeatUntil: "",
    useDefaultReminders: true,
    reminders: [30],
    guests: [],
    addMeet: false,
    transparency: "opaque",
    visibility: "default",
    sendInvites: true,
  };
}

export function draftFromEvent(ev: UiEvent): EventDraft {
  const base = newDraft(ev.start, ev.end, ev.allDay, ev.calendarId);
  if (ev.source === "local" && ev.local) {
    const l = ev.local;
    const color = GOOGLE_EVENT_COLORS.find((c) => c.hex === l.color);
    return {
      ...base,
      title: l.title,
      location: l.location,
      description: l.description,
      colorId: color?.id || "",
      repeat: l.repeat,
      repeatUntil: l.repeatUntil || "",
      useDefaultReminders: false,
      reminders: l.reminders,
      // eventos repetidos editam a série inteira: usa as datas originais
      ...(l.repeat !== "none"
        ? (() => {
            const s = parseLocal(l.start);
            const e = parseLocal(l.end);
            return { startDate: ymd(s), startTime: hm(s), endDate: ymd(e), endTime: hm(e) };
          })()
        : {}),
    };
  }
  const g = ev.google;
  if (!g) return base;
  const rec = fromRRule(g.recurrence);
  return {
    ...base,
    title: g.summary || "",
    location: g.location || "",
    description: g.description || "",
    colorId: g.colorId || "",
    repeat: g.recurringEventId ? "custom" : rec.rule,
    repeatUntil: rec.until || "",
    useDefaultReminders: g.reminders?.useDefault !== false,
    reminders: (g.reminders?.overrides || []).map((o) => o.minutes),
    guests: (g.attendees || []).filter((a) => !a.self || !a.organizer).map((a) => a.email),
    addMeet: !!meetLink(g),
    transparency: g.transparency || "opaque",
    visibility: g.visibility === "confidential" ? "private" : g.visibility || "default",
  };
}

function draftTimes(d: EventDraft): { start: Date; end: Date } {
  if (d.allDay) {
    const start = parseLocal(d.startDate);
    const lastDay = parseLocal(d.endDate < d.startDate ? d.startDate : d.endDate);
    return { start, end: addDaysDate(lastDay, 1) };
  }
  const start = parseLocal(`${d.startDate}T${d.startTime}`);
  let end = parseLocal(`${d.endDate}T${d.endTime}`);
  if (end <= start) end = new Date(start.getTime() + 30 * 60_000);
  return { start, end };
}

export function validateDraft(d: EventDraft): string | null {
  if (!d.startDate || !d.endDate) return "Escolha a data do evento.";
  if (!d.allDay && (!d.startTime || !d.endTime)) return "Escolha o horário de início e de fim.";
  const { start, end } = draftTimes(d);
  if (end.getTime() - start.getTime() > 366 * 86_400_000) return "O evento não pode durar mais de um ano.";
  const bad = d.guests.find((g) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g));
  if (bad) return `O convidado "${bad}" não parece um e-mail válido.`;
  return null;
}

function googleTimes(d: EventDraft) {
  const { start, end } = draftTimes(d);
  if (d.allDay) return { start: { date: ymd(start) }, end: { date: ymd(end) } };
  return { start: { dateTime: start.toISOString(), timeZone: TIME_ZONE }, end: { dateTime: end.toISOString(), timeZone: TIME_ZONE } };
}

function googleBody(d: EventDraft, original: GEvent | undefined, scope: EditScope | null): Record<string, unknown> {
  const { start } = draftTimes(d);
  const existingAttendees = original?.attendees || [];
  const attendees: GAttendee[] = d.guests.map((email) => existingAttendees.find((a) => a.email.toLowerCase() === email.toLowerCase()) || { email });
  // quem organiza continua na lista quando já estava nela
  existingAttendees.filter((a) => a.self && a.organizer).forEach((a) => attendees.push(a));
  const hadMeet = !!meetLink(original);
  const body: Record<string, unknown> = {
    summary: d.title.trim() || "(Sem título)",
    location: d.location,
    description: d.description,
    colorId: d.colorId || null,
    ...googleTimes(d),
    attendees,
    transparency: d.transparency,
    visibility: d.visibility,
    reminders: d.useDefaultReminders
      ? { useDefault: true }
      : { useDefault: false, overrides: d.reminders.slice(0, 5).map((minutes) => ({ method: "popup", minutes })) },
  };
  // em evento novo, sem cor escolhida, fica a cor da agenda
  if (!original && !d.colorId) delete body.colorId;
  if (d.addMeet && !hadMeet) body.conferenceData = { createRequest: { requestId: uid(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  if (!d.addMeet && hadMeet) body.conferenceData = null;
  // repetição só vale para a série inteira ou para eventos novos
  if (scope !== "instance" && d.repeat !== "custom") {
    body.recurrence = toRRule(d.repeat, start, d.repeatUntil || null) || [];
  }
  return body;
}

function localFromDraft(d: EventDraft, existing?: LocalEvent): LocalEvent {
  const color = GOOGLE_EVENT_COLORS.find((c) => c.id === d.colorId)?.hex || "";
  return {
    id: existing?.id || uid(),
    title: d.title.trim() || "(Sem título)",
    allDay: d.allDay,
    start: d.allDay ? d.startDate : `${d.startDate}T${d.startTime}`,
    end: d.allDay ? (d.endDate < d.startDate ? d.startDate : d.endDate) : `${d.endDate}T${d.endTime}`,
    location: d.location,
    description: d.description,
    color,
    repeat: d.repeat === "custom" ? "none" : d.repeat,
    repeatUntil: d.repeatUntil || null,
    reminders: d.reminders,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/** Cria ou atualiza. `original` indica edição; `scope` vale para eventos repetidos do Google. */
export async function saveDraft(d: EventDraft, original?: UiEvent, scope: EditScope = "instance") {
  const toLocal = d.calendarId === LOCAL_CALENDAR_ID;
  const sendUpdates = d.guests.length && d.sendInvites ? "all" : "none";

  // novo evento
  if (!original) {
    if (toLocal) {
      const ev = localFromDraft(d);
      insert("events", ev);
      return;
    }
    await createEvent(d.calendarId, googleBody(d, undefined, null), sendUpdates);
    return;
  }

  // edição de evento local
  if (original.source === "local" && original.local) {
    if (toLocal) {
      const updated = localFromDraft(d, original.local);
      patch("events", original.local.id, updated);
      return;
    }
    // levou para o Google: cria lá e apaga daqui
    await createEvent(d.calendarId, googleBody(d, undefined, null), sendUpdates);
    remove("events", original.local.id);
    return;
  }

  const g = original.google;
  if (!g) return;
  if (toLocal) {
    insert("events", localFromDraft(d));
    await deleteEvent(g.calendarId, scope === "all" && g.recurringEventId ? g.recurringEventId : g.id);
    return;
  }

  let calendarId = g.calendarId;
  let targetId = scope === "all" && g.recurringEventId ? g.recurringEventId : g.id;
  let body = googleBody(d, g, g.recurringEventId ? scope : null);

  if (scope === "all" && g.recurringEventId) {
    // mantém as datas da série e aplica só o novo horário e duração
    const master = await getEvent(g.calendarId, g.recurringEventId);
    if (master.start && !d.allDay && master.start.dateTime) {
      const { start, end } = draftTimes(d);
      const mStart = new Date(master.start.dateTime);
      const newStart = new Date(mStart.getFullYear(), mStart.getMonth(), mStart.getDate(), start.getHours(), start.getMinutes());
      const newEnd = new Date(newStart.getTime() + (end.getTime() - start.getTime()));
      body = { ...body, start: { dateTime: newStart.toISOString(), timeZone: TIME_ZONE }, end: { dateTime: newEnd.toISOString(), timeZone: TIME_ZONE } };
    } else {
      delete body.start;
      delete body.end;
    }
    if (d.repeat !== "custom") body.recurrence = toRRule(d.repeat, parseLocal(master.start?.date || ymd(new Date(master.start?.dateTime || Date.now()))), d.repeatUntil || null) || [];
  }

  if (d.calendarId !== calendarId) {
    const moved = await moveEvent(calendarId, targetId, d.calendarId);
    calendarId = d.calendarId;
    targetId = moved.id;
  }
  await updateEvent(calendarId, targetId, body, sendUpdates);
}

export async function deleteUiEvent(ev: UiEvent, scope: EditScope = "instance", notify = false) {
  if (ev.source === "local") {
    remove("events", ev.id);
    return;
  }
  if (ev.source !== "google" || !ev.google) return;
  const target = scope === "all" && ev.google.recurringEventId ? ev.google.recurringEventId : ev.google.id;
  await deleteEvent(ev.calendarId, target, notify ? "all" : "none");
}

/** Arrastar e soltar: muda início e fim mantendo o resto. */
export async function rescheduleUiEvent(ev: UiEvent, start: Date, end: Date) {
  if (ev.source === "local" && ev.local) {
    if (ev.local.repeat !== "none") throw new Error("Para mudar um evento que se repete, abra o evento e edite as datas.");
    patch("events", ev.local.id, {
      start: ev.allDay ? ymd(start) : `${ymd(start)}T${hm(start)}`,
      end: ev.allDay ? ymd(addDaysDate(end, -1)) : `${ymd(end)}T${hm(end)}`,
      updatedAt: Date.now(),
    });
    return;
  }
  if (ev.source === "google" && ev.google) {
    const times = ev.allDay
      ? { start: { date: ymd(start) }, end: { date: ymd(end) } }
      : { start: { dateTime: start.toISOString(), timeZone: TIME_ZONE }, end: { dateTime: end.toISOString(), timeZone: TIME_ZONE } };
    // convidados recebem o novo horário, como no Google Agenda
    const hasGuests = (ev.google.attendees || []).some((x) => !x.self);
    await updateEvent(ev.calendarId, ev.google.id, times, hasGuests ? "all" : "none");
  }
}

/* ---------------- Carregamento por período ---------------- */

export function useCalendarEvents(from: Date, to: Date, query = "") {
  const state = useApp();
  const gcal = useGcal();
  const [google, setGoogle] = useState<GEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reqId = useRef(0);
  const hidden = state.calendarPrefs.hidden;

  const visibleGoogle = useMemo(() => gcal.calendars.filter((c) => !hidden.includes(c.id)).map((c) => c.id), [gcal.calendars, hidden]);
  const fromKey = from.getTime();
  const toKey = to.getTime();
  const visibleKey = visibleGoogle.join("|");

  useEffect(() => {
    if (!gcal.connected || !visibleGoogle.length) {
      setGoogle([]);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = window.setTimeout(
      () => {
        listEvents(visibleGoogle, new Date(fromKey), new Date(toKey), query.trim() || undefined)
          .then((res) => {
            if (id !== reqId.current) return;
            setGoogle(res.items);
            setError(res.errors.length ? `Algumas agendas não carregaram: ${res.errors.map((e) => e.message).join("; ")}` : "");
          })
          .catch((e) => {
            if (id !== reqId.current) return;
            setError(e instanceof Error ? e.message : "Erro ao carregar o Google Agenda.");
          })
          .finally(() => id === reqId.current && setLoading(false));
      },
      query ? 350 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [gcal.connected, visibleKey, fromKey, toKey, gcal.version, query]);

  const events = useMemo(() => {
    const f = new Date(fromKey);
    const t = new Date(toKey);
    const q = query.trim().toLowerCase();
    const matches = (e: UiEvent) => !q || `${e.title} ${e.location || ""} ${e.description || ""}`.toLowerCase().includes(q);
    const list: UiEvent[] = [];
    if (!hidden.includes(LOCAL_CALENDAR_ID)) list.push(...expandLocal(state.events, f, t).filter(matches));
    const app = appItemsAsEvents(state, f, t).filter((e) => !hidden.includes(e.calendarId) && matches(e));
    list.push(...app);
    for (const g of google) {
      const ui = googleToUi(g, gcal.calendars);
      if (ui && !hidden.includes(ui.calendarId)) list.push(ui);
    }
    return list.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
  }, [state, google, gcal.calendars, hidden, fromKey, toKey, query]);

  return { events, loading, error };
}

/** Eventos de hoje (Google + locais), usado no Hoje e no assistente. */
export function eventsForDay(day: Date): Promise<UiEvent[]> {
  const from = startOfDay(day);
  return eventsInRange(from, addDaysDate(from, 1));
}

/** Eventos do Organizador e do Google (sem tarefas e vídeos) num período. */
export async function eventsInRange(from: Date, to: Date): Promise<UiEvent[]> {
  const state = appStore.get();
  const list = expandLocal(state.events, from, to);
  const g = gcalStore.get();
  if (g.connected && g.calendars.length) {
    const visible = g.calendars.filter((c) => !state.calendarPrefs.hidden.includes(c.id)).map((c) => c.id);
    try {
      const res = await listEvents(visible, from, to);
      res.items.forEach((e) => {
        const ui = googleToUi(e, g.calendars);
        if (ui) list.push(ui);
      });
    } catch {
      /* sem Google: só os locais */
    }
  }
  return list.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Agenda onde novos eventos entram: a padrão do Google, se conectado; senão, o Organizador. */
export function defaultCalendarId(): string {
  const g = gcalStore.get();
  if (!g.connected) return LOCAL_CALENDAR_ID;
  const writable = g.calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
  const pref = appStore.get().calendarPrefs.defaultCalendarId;
  return writable.find((c) => c.id === pref)?.id || writable.find((c) => c.primary)?.id || writable[0]?.id || LOCAL_CALENDAR_ID;
}
