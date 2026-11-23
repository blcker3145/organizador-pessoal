/*
 * Prospecção: empresas sem site encontradas no Google Places.
 * A busca roda na função "prospect" do Supabase (a chave do Google fica lá);
 * a lista mora na tabela prospect_leads, que só a conta de quem administra enxerga.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createStore } from "./createStore";
import { ADMIN_EMAIL } from "./feedback";
import { supabase } from "./supabase";

export type LeadStatus = "encontrado" | "qualificado" | "contatado" | "respondeu" | "reuniao" | "proposta" | "fechado" | "perdido";
export type SiteKind = "nenhum" | "instagram" | "facebook" | "link" | "whatsapp";

export interface Lead {
  id: string;
  place_id: string;
  name: string;
  category: string;
  phone: string;
  phone_kind: "" | "celular" | "fixo";
  address: string;
  rating: number | null;
  reviews: number;
  maps_url: string;
  site_kind: SiteKind;
  site_url: string;
  search: string;
  status: LeadStatus;
  score: number | null;
  temperature: "quente" | "morno" | "frio" | null;
  reason: string;
  message: string;
  contacted_at: string | null;
  replied_at: string | null;
  next_followup: string | null;
  notes: string;
  created_at: string;
}

export interface ProspectSearch {
  id: string;
  query: string;
  found: number;
  without_site: number;
  inserted: number;
  created_at: string;
}

export interface SearchSummary {
  query: string;
  found: number;
  closed: number;
  withoutSite: number;
  inserted: number;
}

export const STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: "encontrado", label: "Encontrado", color: "" },
  { value: "qualificado", label: "Qualificado", color: "blue" },
  { value: "contatado", label: "Contatado", color: "purple" },
  { value: "respondeu", label: "Respondeu", color: "orange" },
  { value: "reuniao", label: "Reunião", color: "orange" },
  { value: "proposta", label: "Proposta", color: "purple" },
  { value: "fechado", label: "Fechado", color: "green" },
  { value: "perdido", label: "Perdido", color: "red" },
];

export const SITE_LABEL: Record<SiteKind, string> = {
  nenhum: "Sem site",
  instagram: "Só Instagram",
  facebook: "Só Facebook",
  link: "Link de bio",
  whatsapp: "Só WhatsApp",
};

export const statusInfo = (s: LeadStatus) => STATUSES.find((x) => x.value === s) || STATUSES[0];

/** Só a conta de quem administra vê a aba. */
export const canProspect = (email: string | null | undefined) => (email || "").toLowerCase() === ADMIN_EMAIL;

/** "pesquisar: painel solar em Chapecó" → "painel solar em Chapecó" */
export function parseCommand(text: string): string {
  return text.replace(/^\s*(pesquisar|pesquisa|buscar|busca|procurar)\s*:?\s*/i, "").trim();
}

/** Telefone só com números, com o 55 do Brasil na frente (para o link do WhatsApp). */
export function phoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^0/, "");
  if (!d) return "";
  return d.startsWith("55") && d.length > 11 ? d : `55${d}`;
}

export class ProspectError extends Error {}

/* ---------------- Servidor (ou simulação em desenvolvimento) ---------------- */

type Backend = (body: Record<string, unknown>) => Promise<unknown>;

/** Em desenvolvimento dá para simular tudo com window.__prospectMock. */
function mock(): Backend | null {
  if (!import.meta.env.DEV) return null;
  const m = (window as unknown as { __prospectMock?: Backend }).__prospectMock;
  return typeof m === "function" ? m : null;
}

const missingTable = (message: string) => /schema cache|does not exist|relation .* does not exist/i.test(message);
const tableError = (message: string) =>
  new ProspectError(missingTable(message) ? "Falta rodar o SQL da prospecção no Supabase (0005_prospeccao.sql)." : message);

function db() {
  if (!supabase) throw new ProspectError("O servidor ainda não foi configurado.");
  return supabase;
}

async function callFunction<T>(body: Record<string, unknown>): Promise<T> {
  const m = mock();
  if (m) return (await m(body)) as T;
  const { data, error } = await db().functions.invoke("prospect", { body });
  if (error) {
    let message = "";
    if (error instanceof FunctionsHttpError) {
      try {
        message = (await error.context.json())?.error || "";
      } catch {
        /* resposta sem JSON */
      }
      if (!message && error.context.status === 404) message = 'A função "prospect" ainda não foi publicada no Supabase.';
    }
    throw new ProspectError(message || "Não foi possível falar com o servidor agora.");
  }
  return data as T;
}

/* ---------------- Estado da tela ---------------- */

interface ProspectState {
  leads: Lead[];
  searches: ProspectSearch[];
  loaded: boolean;
  loading: boolean;
  searching: boolean;
  error: string;
  /** a chave do Google já está no servidor? (null = ainda não sabemos) */
  configured: boolean | null;
}

export const prospectStore = createStore<ProspectState>({
  leads: [],
  searches: [],
  loaded: false,
  loading: false,
  searching: false,
  error: "",
  configured: null,
});
export const useProspect = prospectStore.use;
const set = (p: Partial<ProspectState>) => prospectStore.set((s) => ({ ...s, ...p }));

export async function loadProspect() {
  if (prospectStore.get().loading) return;
  set({ loading: true, error: "" });
  try {
    const m = mock();
    if (m) {
      const data = (await m({ action: "list" })) as { leads: Lead[]; searches: ProspectSearch[]; configured: boolean };
      set({ leads: data.leads, searches: data.searches, configured: data.configured, loaded: true });
      return;
    }
    const [leads, searches] = await Promise.all([
      db().from("prospect_leads").select("*").order("created_at", { ascending: false }).limit(2000),
      db().from("prospect_searches").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    if (leads.error) throw tableError(leads.error.message);
    if (searches.error) throw tableError(searches.error.message);
    set({ leads: (leads.data || []) as Lead[], searches: (searches.data || []) as ProspectSearch[], loaded: true });
    callFunction<{ configured: boolean }>({ action: "status" })
      .then((r) => set({ configured: !!r.configured }))
      .catch(() => set({ configured: null }));
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e), loaded: true });
  } finally {
    set({ loading: false });
  }
}

export async function runSearch(command: string): Promise<SearchSummary> {
  const query = parseCommand(command);
  if (query.length < 3) throw new ProspectError("Escreva o nicho e a cidade. Ex.: pesquisar: painel solar em Chapecó");
  set({ searching: true });
  try {
    const summary = await callFunction<SearchSummary>({ action: "search", query });
    set({ loading: false });
    await loadProspect();
    return summary;
  } finally {
    set({ searching: false });
  }
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  const before = prospectStore.get().leads;
  set({ leads: before.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  try {
    const m = mock();
    if (m) await m({ action: "update", id, patch });
    else {
      const { error } = await db().from("prospect_leads").update(patch).eq("id", id);
      if (error) throw tableError(error.message);
    }
  } catch (e) {
    set({ leads: before });
    throw e;
  }
}

export async function deleteLead(id: string) {
  const before = prospectStore.get().leads;
  set({ leads: before.filter((l) => l.id !== id) });
  try {
    const m = mock();
    if (m) await m({ action: "delete", id });
    else {
      const { error } = await db().from("prospect_leads").delete().eq("id", id);
      if (error) throw tableError(error.message);
    }
  } catch (e) {
    set({ leads: before });
    throw e;
  }
}
