// Função do Supabase que conecta cada conta do Organizador ao Google Agenda.
// - Faz o login do Google (OAuth) e guarda a autorização de longo prazo no banco.
// - Lê e grava eventos no Google Agenda em nome da pessoa logada.
// O navegador nunca vê os tokens do Google.
//
// IMPORTANTE: publique esta função com "Verify JWT" DESLIGADO. O Google volta
// para ela sem o login do Supabase; a própria função confere o login nos demais pedidos.
//
// Segredos (Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID       ID do cliente OAuth (Google Cloud → Credenciais)
//   GOOGLE_CLIENT_SECRET   chave secreta desse cliente
// Opcionais:
//   GOOGLE_REDIRECT_URI    endereço de retorno; padrão: o endereço desta função
//   APP_ORIGINS            sites que podem receber a volta do login, separados por vírgula
//                          (padrão: https://blcker3145.github.io,http://localhost:5173)
//   GOOGLE_STATE_SECRET    chave para assinar o pedido de login (padrão: GOOGLE_CLIENT_SECRET)

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar"];
const CAL_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_ORIGINS = ["https://blcker3145.github.io", "http://localhost:5173"];

type Json = Record<string, unknown>;

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const env = (name: string) => (Deno.env.get(name) || "").trim();

/* ---------------- Clientes do Supabase ---------------- */

function serviceKey(): string {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  // projetos com as chaves novas expõem um JSON com as secret keys
  try {
    const parsed = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}");
    const first = Object.values(parsed)[0];
    if (typeof first === "string") return first;
  } catch {
    /* sem chave */
  }
  return "";
}

function adminClient(): SupabaseClient {
  const key = serviceKey();
  if (!key) throw new HttpError(500, "A função não encontrou a chave de serviço do Supabase.");
  return createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) throw new HttpError(401, "Entre na sua conta para usar a agenda.");
  const publicKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || req.headers.get("apikey") || "";
  const client = createClient(env("SUPABASE_URL"), publicKey, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");
  return { id: data.user.id, email: data.user.email };
}

/* ---------------- Assinatura do "state" do OAuth ---------------- */

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function hmac(data: string): Promise<string> {
  const secret = env("GOOGLE_STATE_SECRET") || env("GOOGLE_CLIENT_SECRET");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

async function signState(payload: Json): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

async function readState(state: string): Promise<{ u: string; r: string; exp: number } | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig || (await hmac(body)) !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (typeof payload.u !== "string" || typeof payload.r !== "string" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function allowedReturn(url: string): string | null {
  try {
    const parsed = new URL(url);
    const origins = (env("APP_ORIGINS") ? env("APP_ORIGINS").split(",") : DEFAULT_ORIGINS).map((o) => o.trim().replace(/\/$/, ""));
    return origins.includes(parsed.origin) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function redirectUri(req: Request): string {
  if (env("GOOGLE_REDIRECT_URI")) return env("GOOGLE_REDIRECT_URI");
  const slug = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "google-calendar";
  return `${env("SUPABASE_URL")}/functions/v1/${slug}`;
}

/* ---------------- Tokens do Google ---------------- */

const accessCache = new Map<string, { token: string; expires: number }>();

async function googleToken(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function accessTokenFor(userId: string): Promise<string> {
  const cached = accessCache.get(userId);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const admin = adminClient();
  const { data: row } = await admin.from("google_connections").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!row) throw new HttpError(409, "Conecte o Google Agenda para ver e editar seus eventos.", "NOT_CONNECTED");
  const { ok, data } = await googleToken({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  if (!ok) {
    if (data?.error === "invalid_grant") {
      // acesso revogado ou expirado no Google: pede para conectar de novo
      await admin.from("google_connections").delete().eq("user_id", userId);
      accessCache.delete(userId);
      throw new HttpError(409, "A conexão com o Google expirou ou foi removida. Conecte o Google Agenda de novo.", "NOT_CONNECTED");
    }
    throw new HttpError(502, `O Google recusou a renovação do acesso (${data?.error_description || data?.error || "erro"}).`);
  }
  accessCache.set(userId, { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 });
  return data.access_token;
}

async function calendarApi(userId: string, path: string, init: RequestInit & { query?: Record<string, string | undefined> } = {}) {
  const token = await accessTokenFor(userId);
  const url = new URL(`${CAL_API}${path}`);
  for (const [k, v] of Object.entries(init.query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method || "GET",
    body: init.body,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message: string = data?.error?.message || `erro ${res.status}`;
    if (res.status === 401) {
      accessCache.delete(userId);
      throw new HttpError(409, "A conexão com o Google expirou. Conecte o Google Agenda de novo.", "NOT_CONNECTED");
    }
    if (res.status === 403 && /insufficient|scope/i.test(message)) {
      throw new HttpError(409, "Falta permissão para acessar a agenda. Conecte de novo e marque o acesso ao Google Agenda.", "NOT_CONNECTED");
    }
    if (res.status === 403 && /has not been used|disabled/i.test(message)) {
      throw new HttpError(502, "A Google Calendar API não está ativada no projeto do Google Cloud. Ative-a em APIs e serviços → Biblioteca.");
    }
    if (res.status === 404) throw new HttpError(404, "Esse evento ou agenda não existe mais no Google.");
    if (res.status === 409) throw new HttpError(409, "Já existe um evento com esse identificador no Google.");
    if (res.status === 429 || /rate limit/i.test(message)) throw new HttpError(429, "Muitos pedidos seguidos ao Google. Espere alguns segundos.");
    throw new HttpError(res.status >= 500 ? 502 : 400, `Google Agenda: ${message}`);
  }
  return data;
}

/* ---------------- Ações ---------------- */

const EVENT_FIELDS =
  "id,status,summary,description,location,colorId,start,end,recurrence,recurringEventId,originalStartTime,htmlLink,hangoutLink,conferenceData,attendees,organizer,creator,reminders,transparency,visibility,eventType,guestsCanModify";

async function handleAction(req: Request, userId: string, userEmail: string | undefined, body: Json) {
  const action = String(body.action || "");
  const admin = adminClient();

  switch (action) {
    case "status": {
      const configured = !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
      const { data } = await admin.from("google_connections").select("google_email, updated_at").eq("user_id", userId).maybeSingle();
      return { configured, connected: !!data, email: data?.google_email ?? null };
    }

    case "connect": {
      if (!env("GOOGLE_CLIENT_ID") || !env("GOOGLE_CLIENT_SECRET")) {
        throw new HttpError(500, "A integração com o Google ainda não foi configurada no servidor (faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).");
      }
      const returnTo = allowedReturn(String(body.returnTo || ""));
      if (!returnTo) throw new HttpError(400, "Endereço de retorno não permitido. Adicione o site em APP_ORIGINS.");
      const state = await signState({ u: userId, r: returnTo, exp: Date.now() + 10 * 60_000, n: crypto.randomUUID() });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: env("GOOGLE_CLIENT_ID"),
        redirect_uri: redirectUri(req),
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
        ...(userEmail ? { login_hint: userEmail } : {}),
      }).toString();
      return { url: url.toString() };
    }

    case "disconnect": {
      const { data } = await admin.from("google_connections").select("refresh_token").eq("user_id", userId).maybeSingle();
      if (data?.refresh_token) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: data.refresh_token }),
        }).catch(() => undefined);
      }
      await admin.from("google_connections").delete().eq("user_id", userId);
      accessCache.delete(userId);
      return { connected: false };
    }

    case "calendars": {
      const data = await calendarApi(userId, "/users/me/calendarList", { query: { maxResults: "250", minAccessRole: "reader" } });
      return {
        items: (data.items || []).map((c: Json) => ({
          id: c.id,
          summary: c.summaryOverride || c.summary,
          backgroundColor: c.backgroundColor,
          foregroundColor: c.foregroundColor,
          primary: !!c.primary,
          accessRole: c.accessRole,
          selected: c.selected !== false,
          timeZone: c.timeZone,
        })),
      };
    }

    case "events": {
      const ids = Array.isArray(body.calendarIds) ? (body.calendarIds as string[]).slice(0, 25) : [];
      const results = await Promise.all(
        ids.map(async (calendarId) => {
          try {
            const items: Json[] = [];
            let pageToken: string | undefined;
            for (let page = 0; page < 5; page++) {
              const data = await calendarApi(userId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
                query: {
                  timeMin: String(body.timeMin || ""),
                  timeMax: String(body.timeMax || ""),
                  singleEvents: "true",
                  orderBy: "startTime",
                  maxResults: "2500",
                  showDeleted: "false",
                  q: body.q ? String(body.q) : undefined,
                  pageToken,
                  fields: `items(${EVENT_FIELDS}),nextPageToken`,
                },
              });
              items.push(...(data.items || []).map((e: Json) => ({ ...e, calendarId })));
              pageToken = data.nextPageToken;
              if (!pageToken) break;
            }
            return { items };
          } catch (e) {
            if (e instanceof HttpError && e.code === "NOT_CONNECTED") throw e;
            return { items: [], error: { calendarId, message: e instanceof Error ? e.message : "erro" } };
          }
        }),
      );
      return { items: results.flatMap((r) => r.items), errors: results.filter((r) => r.error).map((r) => r.error) };
    }

    case "event": {
      const data = await calendarApi(userId, `/calendars/${encodeURIComponent(String(body.calendarId))}/events/${encodeURIComponent(String(body.eventId))}`);
      return { event: { ...data, calendarId: body.calendarId } };
    }

    case "create": {
      const event = (body.event || {}) as Json;
      const data = await calendarApi(userId, `/calendars/${encodeURIComponent(String(body.calendarId || "primary"))}/events`, {
        method: "POST",
        body: JSON.stringify(event),
        query: { conferenceDataVersion: "1", sendUpdates: body.sendUpdates ? String(body.sendUpdates) : "none" },
      });
      return { event: { ...data, calendarId: body.calendarId || "primary" } };
    }

    case "update": {
      const data = await calendarApi(userId, `/calendars/${encodeURIComponent(String(body.calendarId))}/events/${encodeURIComponent(String(body.eventId))}`, {
        method: "PATCH",
        body: JSON.stringify(body.event || {}),
        query: { conferenceDataVersion: "1", sendUpdates: body.sendUpdates ? String(body.sendUpdates) : "none" },
      });
      return { event: { ...data, calendarId: body.calendarId } };
    }

    case "move": {
      const data = await calendarApi(
        userId,
        `/calendars/${encodeURIComponent(String(body.calendarId))}/events/${encodeURIComponent(String(body.eventId))}/move`,
        { method: "POST", query: { destination: String(body.destination), sendUpdates: "none" } },
      );
      return { event: { ...data, calendarId: body.destination } };
    }

    case "delete": {
      await calendarApi(userId, `/calendars/${encodeURIComponent(String(body.calendarId))}/events/${encodeURIComponent(String(body.eventId))}`, {
        method: "DELETE",
        query: { sendUpdates: body.sendUpdates ? String(body.sendUpdates) : "none" },
      });
      return { deleted: true };
    }

    case "respond": {
      const path = `/calendars/${encodeURIComponent(String(body.calendarId))}/events/${encodeURIComponent(String(body.eventId))}`;
      const current = await calendarApi(userId, path, { query: { fields: "attendees" } });
      const attendees = ((current.attendees || []) as Json[]).map((a) => (a.self ? { ...a, responseStatus: body.status } : a));
      const data = await calendarApi(userId, path, { method: "PATCH", body: JSON.stringify({ attendees }), query: { sendUpdates: "all" } });
      return { event: { ...data, calendarId: body.calendarId } };
    }

    default:
      throw new HttpError(400, "Ação desconhecida.");
  }
}

/* ---------------- Volta do login do Google ---------------- */

function backTo(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

async function handleCallback(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const state = await readState(params.get("state") || "");
  if (!state) return new Response("Pedido de conexão inválido ou expirado. Volte ao Organizador e tente de novo.", { status: 400 });
  if (params.get("error")) return backTo(state.r, { gcal: "erro", motivo: params.get("error") === "access_denied" ? "negado" : "google" });

  const { ok, data } = await googleToken({ grant_type: "authorization_code", code: params.get("code") || "", redirect_uri: redirectUri(req) });
  if (!ok) return backTo(state.r, { gcal: "erro", motivo: "troca" });
  if (!String(data.scope || "").includes("auth/calendar")) return backTo(state.r, { gcal: "erro", motivo: "permissao" });

  let email: string | null = null;
  try {
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } });
    email = (await info.json()).email ?? null;
  } catch {
    /* e-mail é só informativo */
  }

  const admin = adminClient();
  const { data: existing } = await admin.from("google_connections").select("refresh_token").eq("user_id", state.u).maybeSingle();
  const refresh = data.refresh_token || existing?.refresh_token;
  if (!refresh) return backTo(state.r, { gcal: "erro", motivo: "sem_refresh" });
  const { error } = await admin
    .from("google_connections")
    .upsert({ user_id: state.u, google_email: email, refresh_token: refresh, scope: data.scope, updated_at: new Date().toISOString() });
  if (error) return backTo(state.r, { gcal: "erro", motivo: "banco" });

  accessCache.set(state.u, { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 });
  return backTo(state.r, { gcal: "conectado" });
}

/* ---------------- Entrada ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      if (params.has("state")) return await handleCallback(req);
      return new Response("Organizador · integração com o Google Agenda.", { status: 200 });
    }
    if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
    const user = await requireUser(req);
    let body: Json;
    try {
      body = await req.json();
    } catch {
      return reply({ error: "Pedido inválido." }, 400);
    }
    return reply(await handleAction(req, user.id, user.email, body));
  } catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message, code: e.code }, e.status);
    return reply({ error: "Erro inesperado na integração com o Google Agenda." }, 500);
  }
});
