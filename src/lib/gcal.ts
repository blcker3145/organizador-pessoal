/* Cliente do Google Agenda: conversa com a função "google-calendar" do Supabase. */
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { GCalendar, GEvent } from "./calendar";
import { createStore } from "./createStore";
import { appUrl, supabase } from "./supabase";

const GCAL_FUNCTION = (import.meta.env.VITE_SUPABASE_GCAL_FUNCTION as string | undefined)?.trim() || "google-calendar";

export class GcalError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

type Backend = (body: Record<string, unknown>) => Promise<unknown>;

/** Em desenvolvimento dá para trocar o servidor por um simulado (window.__gcalMock). */
function devMock(): Backend | null {
  if (!import.meta.env.DEV) return null;
  const mock = (window as unknown as { __gcalMock?: Backend }).__gcalMock;
  return typeof mock === "function" ? mock : null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const mock = devMock();
  if (mock) {
    try {
      return (await mock(body)) as T;
    } catch (e) {
      const err = e as { message?: string; code?: string };
      throw new GcalError(err.message || "Erro no Google Agenda.", err.code);
    }
  }
  if (!supabase) throw new GcalError("O servidor ainda não foi configurado.");
  const { data, error } = await supabase.functions.invoke(GCAL_FUNCTION, { body });
  if (error) {
    let message = "";
    let code: string | undefined;
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        message = payload?.error || "";
        code = payload?.code;
      } catch {
        /* resposta sem JSON */
      }
      if (!message && error.context.status === 404) message = "A função do Google Agenda ainda não foi publicada no Supabase.";
    }
    if (!message) message = "Não foi possível falar com o servidor do Google Agenda. Confira sua internet.";
    if (code === "NOT_CONNECTED") gcalStore.set((s) => ({ ...s, connected: false, email: null }));
    throw new GcalError(message, code);
  }
  return data as T;
}

/* ---------------- Estado da conexão ---------------- */

interface GcalState {
  checked: boolean;
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendars: GCalendar[];
  error: string;
  /** muda a cada alteração para as telas recarregarem os eventos */
  version: number;
}

export const gcalStore = createStore<GcalState>({ checked: false, configured: true, connected: false, email: null, calendars: [], error: "", version: 0 });
export const useGcal = gcalStore.use;
const set = (p: Partial<GcalState>) => gcalStore.set((s) => ({ ...s, ...p }));
export const bumpGcal = () => gcalStore.set((s) => ({ ...s, version: s.version + 1 }));

let statusPromise: Promise<void> | null = null;

export function refreshGcalStatus(force = false): Promise<void> {
  if (statusPromise && !force) return statusPromise;
  statusPromise = (async () => {
    try {
      const status = await call<{ configured: boolean; connected: boolean; email: string | null }>({ action: "status" });
      set({ checked: true, configured: status.configured, connected: status.connected, email: status.email, error: "" });
      if (status.connected) await loadCalendars();
      else set({ calendars: [] });
    } catch (e) {
      set({ checked: true, error: e instanceof Error ? e.message : "Erro ao verificar o Google Agenda." });
    }
  })();
  return statusPromise;
}

export async function loadCalendars() {
  const { items } = await call<{ items: GCalendar[] }>({ action: "calendars" });
  // agenda principal primeiro, depois as próprias, depois as assinadas
  const rank = (c: GCalendar) => (c.primary ? 0 : c.accessRole === "owner" ? 1 : c.accessRole === "writer" ? 2 : 3);
  set({ calendars: [...items].sort((a, b) => rank(a) - rank(b) || a.summary.localeCompare(b.summary)), version: gcalStore.get().version + 1 });
}

export async function connectGoogle() {
  const returnTo = `${appUrl()}${window.location.hash || "#/agenda"}`;
  const { url } = await call<{ url: string }>({ action: "connect", returnTo });
  window.location.assign(url);
}

export async function disconnectGoogle() {
  await call({ action: "disconnect" });
  set({ connected: false, email: null, calendars: [] });
  bumpGcal();
}

/** Lê o retorno do login do Google (?gcal=...) e limpa o endereço. */
export function consumeGcalReturn(): { ok: boolean; reason?: string } | null {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("gcal");
  if (!status) return null;
  const reason = params.get("motivo") || undefined;
  params.delete("gcal");
  params.delete("motivo");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  return { ok: status === "conectado", reason };
}

export const GCAL_RETURN_MESSAGES: Record<string, string> = {
  negado: "Você cancelou a autorização no Google. Nada foi conectado.",
  permissao: "O Google não liberou o acesso à agenda. Conecte de novo e marque a permissão do Google Agenda.",
  troca: "O Google não confirmou a conexão. Confira o ID e a chave do cliente OAuth no Supabase e o endereço de retorno no Google Cloud.",
  sem_refresh: "O Google não enviou a autorização de longo prazo. Remova o acesso do Organizador em myaccount.google.com/permissions e conecte de novo.",
  banco: "Não foi possível salvar a conexão. Confira se o SQL da agenda foi aplicado no Supabase.",
  google: "O Google recusou a conexão. Tente de novo.",
};

/* ---------------- Eventos ---------------- */

export async function listEvents(calendarIds: string[], timeMin: Date, timeMax: Date, q?: string) {
  if (!calendarIds.length) return { items: [] as GEvent[], errors: [] as { calendarId: string; message: string }[] };
  return call<{ items: GEvent[]; errors: { calendarId: string; message: string }[] }>({
    action: "events",
    calendarIds,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    q: q || undefined,
  });
}

export async function getEvent(calendarId: string, eventId: string) {
  return (await call<{ event: GEvent }>({ action: "event", calendarId, eventId })).event;
}

export async function createEvent(calendarId: string, event: Record<string, unknown>, sendUpdates?: "all" | "none") {
  const res = await call<{ event: GEvent }>({ action: "create", calendarId, event, sendUpdates });
  bumpGcal();
  return res.event;
}

export async function updateEvent(calendarId: string, eventId: string, event: Record<string, unknown>, sendUpdates?: "all" | "none") {
  const res = await call<{ event: GEvent }>({ action: "update", calendarId, eventId, event, sendUpdates });
  bumpGcal();
  return res.event;
}

export async function moveEvent(calendarId: string, eventId: string, destination: string) {
  const res = await call<{ event: GEvent }>({ action: "move", calendarId, eventId, destination });
  bumpGcal();
  return res.event;
}

export async function deleteEvent(calendarId: string, eventId: string, sendUpdates?: "all" | "none") {
  await call({ action: "delete", calendarId, eventId, sendUpdates });
  bumpGcal();
}

export async function respondEvent(calendarId: string, eventId: string, status: "accepted" | "declined" | "tentative") {
  const res = await call<{ event: GEvent }>({ action: "respond", calendarId, eventId, status });
  bumpGcal();
  return res.event;
}

export function writableCalendars(calendars: GCalendar[]) {
  return calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
}
