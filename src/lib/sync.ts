/*
 * Sessão e sincronização com o Supabase.
 * Cada conta tem um documento com todos os dados do app (tabela user_data).
 * O navegador guarda uma cópia por conta para abrir rápido e aguentar quedas de internet.
 */
import type { Session, User } from "@supabase/supabase-js";
import { createStore } from "./createStore";
import { createSeed, emptyState } from "./seed";
import { appStore, normalizeState } from "./store";
import { appUrl, supabase } from "./supabase";
import type { AppState } from "./types";
import { ui } from "./ui";

export type AuthPhase = "loading" | "signedOut" | "recovery" | "onboarding" | "ready" | "error";
export type SaveStatus = "saved" | "saving" | "offline" | "error";

interface SessionState {
  phase: AuthPhase;
  user: User | null;
  saveStatus: SaveStatus;
  error: string;
  legacyAvailable: boolean;
}

export const sessionStore = createStore<SessionState>({ phase: "loading", user: null, saveStatus: "saved", error: "", legacyAvailable: false });
export const useSession = sessionStore.use;
const setSession = (p: Partial<SessionState>) => sessionStore.set((s) => ({ ...s, ...p }));

/** Dados salvos no navegador antes de existir login. */
const LEGACY_KEY = "organizador:v1";
const cacheKey = (userId: string) => `organizador:conta:${userId}`;

let currentUserId: string | null = null;
let hydrated = false;
let applyingRemote = false;
let dirty = false;
let inFlight = false;
let saveTimer: number | undefined;
let remoteUpdatedAt: string | null = null;
let started = false;

/* ---------------- Cópia local por conta ---------------- */

function readCache(userId: string): { data: AppState; remoteUpdatedAt: string | null } | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = normalizeState(parsed.data);
    return data ? { data, remoteUpdatedAt: parsed.remoteUpdatedAt ?? null } : null;
  } catch {
    return null;
  }
}

function writeCache() {
  if (!currentUserId) return;
  try {
    localStorage.setItem(cacheKey(currentUserId), JSON.stringify({ data: appStore.get(), remoteUpdatedAt }));
  } catch {
    /* navegador cheio: a nuvem continua sendo a fonte */
  }
}

export function legacyData(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function applyState(state: AppState) {
  applyingRemote = true;
  appStore.set(state);
  applyingRemote = false;
}

/* ---------------- Envio para a nuvem ---------------- */

appStore.subscribe(() => {
  if (!hydrated || applyingRemote) return;
  dirty = true;
  setSession({ saveStatus: "saving" });
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, 900);
});

async function flush() {
  if (!supabase || !currentUserId || !hydrated) return;
  if (inFlight) return;
  inFlight = true;
  dirty = false;
  const userId = currentUserId;
  writeCache();
  try {
    const { data, error } = await supabase.from("user_data").upsert({ user_id: userId, data: appStore.get() }).select("updated_at").single();
    if (userId !== currentUserId) return;
    if (error) throw error;
    remoteUpdatedAt = data.updated_at;
    writeCache();
    if (!dirty) setSession({ saveStatus: "saved" });
  } catch {
    dirty = true;
    setSession({ saveStatus: navigator.onLine ? "error" : "offline" });
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 8000);
  } finally {
    inFlight = false;
    if (dirty && sessionStore.get().saveStatus === "saving") {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, 400);
    }
  }
}

/** Salva agora o que estiver pendente (ex.: antes de sair da conta). */
export async function flushNow() {
  window.clearTimeout(saveTimer);
  if (dirty) await flush();
}

/* ---------------- Abrir a conta ---------------- */

async function openAccount(user: User) {
  currentUserId = user.id;
  hydrated = false;
  dirty = false;
  const cache = readCache(user.id);
  if (cache) {
    applyState(cache.data);
    remoteUpdatedAt = cache.remoteUpdatedAt;
    hydrated = true;
    setSession({ phase: "ready", user, saveStatus: "saved" });
  } else {
    applyState(emptyState());
    setSession({ phase: "loading", user });
  }

  try {
    const { data: remote, error } = await supabase!.from("user_data").select("data, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (currentUserId !== user.id) return;

    if (remote) {
      const state = normalizeState(remote.data);
      // mudanças feitas enquanto carregava ganham; senão vale a versão da nuvem
      if (state && !dirty && remote.updated_at !== cache?.remoteUpdatedAt) applyState(state);
      if (!dirty) remoteUpdatedAt = remote.updated_at;
      hydrated = true;
      writeCache();
      setSession({ phase: "ready", saveStatus: dirty ? "saving" : "saved" });
      if (dirty) flush();
    } else if (cache) {
      hydrated = true;
      dirty = true;
      flush();
    } else {
      setSession({ phase: "onboarding", legacyAvailable: !!legacyData() });
    }
  } catch {
    if (currentUserId !== user.id) return;
    if (cache) {
      setSession({ saveStatus: "offline" });
    } else {
      setSession({
        phase: "error",
        error: "Não foi possível carregar seus dados. Confira sua internet e se o SQL do projeto foi aplicado no Supabase.",
      });
    }
  }
}

export async function finishOnboarding(choice: "empty" | "seed" | "legacy") {
  const user = sessionStore.get().user;
  let state = choice === "seed" ? createSeed() : choice === "legacy" ? legacyData() || emptyState() : emptyState();
  const name = (user?.user_metadata?.name as string | undefined)?.trim();
  if (name && !state.profile.name) state = { ...state, profile: { ...state.profile, name } };
  applyState(state);
  hydrated = true;
  dirty = true;
  setSession({ phase: "ready", saveStatus: "saving" });
  await flush();
  if (choice === "legacy") {
    // guarda uma cópia com outro nome em vez de apagar, por segurança
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) localStorage.setItem(`${LEGACY_KEY}:migrado`, raw);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignora */
    }
    ui.toast("Seus dados deste navegador agora estão na sua conta");
  }
}

/** Busca mudanças feitas em outro dispositivo quando a aba volta a ficar visível. */
async function refreshFromCloud() {
  if (!supabase || !currentUserId || !hydrated || dirty || inFlight) return;
  const userId = currentUserId;
  const { data, error } = await supabase.from("user_data").select("updated_at").eq("user_id", userId).maybeSingle();
  if (error || !data || data.updated_at === remoteUpdatedAt || userId !== currentUserId || dirty) return;
  const { data: full } = await supabase.from("user_data").select("data, updated_at").eq("user_id", userId).maybeSingle();
  const state = full && normalizeState(full.data);
  if (!state || dirty || userId !== currentUserId) return;
  applyState(state);
  remoteUpdatedAt = full.updated_at;
  writeCache();
  ui.toast("Dados atualizados com as mudanças de outro dispositivo");
}

/* ---------------- Autenticação ---------------- */

function cleanAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const description = params.get("error_description");
  if (description) ui.toast(/expired|invalid/i.test(description) ? "Esse link expirou ou já foi usado. Peça um novo." : description);
  if (params.has("code") || params.has("error") || description) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  }
}

function handleSession(event: string, session: Session | null) {
  if (event === "PASSWORD_RECOVERY") {
    cleanAuthParams();
    setSession({ phase: "recovery", user: session?.user ?? null });
    return;
  }
  if (sessionStore.get().phase === "recovery" && session) return;
  if (!session) {
    currentUserId = null;
    hydrated = false;
    dirty = false;
    applyState(emptyState());
    setSession({ phase: "signedOut", user: null, saveStatus: "saved" });
    cleanAuthParams();
    return;
  }
  cleanAuthParams();
  if (session.user.id !== currentUserId) openAccount(session.user);
  else setSession({ user: session.user });
}

export function startAuth() {
  if (started || !supabase) return;
  started = true;
  // chave de IA salva no navegador pela versão antiga: não é mais usada
  try {
    localStorage.removeItem("organizador:openai");
  } catch {
    /* ignora */
  }
  supabase.auth.onAuthStateChange((event, session) => {
    // o Supabase recomenda não fazer chamadas ao banco dentro deste callback
    window.setTimeout(() => handleSession(event, session), 0);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshFromCloud();
  });
  window.addEventListener("online", () => dirty && flush());
  window.addEventListener("beforeunload", (e) => {
    if (dirty || inFlight) {
      writeCache();
      e.preventDefault();
    }
  });
}

/* ---------------- Ações de login ---------------- */

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered|already exists/i.test(message)) return "Já existe uma conta com esse e-mail. Entre ou use Esqueci minha senha.";
  if (/password should be at least|weak password/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/rate limit|too many/i.test(message)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/signups not allowed|signup is disabled/i.test(message)) return "Novos cadastros estão desativados neste app.";
  if (/unable to validate email|invalid email/i.test(message)) return "Esse e-mail não parece válido.";
  if (/failed to fetch|network/i.test(message)) return "Sem conexão com o servidor. Confira sua internet.";
  return message;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
  return error ? translateAuthError(error.message) : null;
}

export async function signUp(name: string, email: string, password: string): Promise<{ error: string | null; needsConfirmation: boolean }> {
  const { data, error } = await supabase!.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: appUrl(), data: { name: name.trim() } },
  });
  if (error) return { error: translateAuthError(error.message), needsConfirmation: false };
  return { error: null, needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string): Promise<string | null> {
  const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
  return error ? translateAuthError(error.message) : null;
}

export async function updatePassword(password: string): Promise<string | null> {
  const { data, error } = await supabase!.auth.updateUser({ password });
  if (error) return translateAuthError(error.message);
  setSession({ phase: "loading" });
  if (data.user) openAccount(data.user);
  return null;
}

export async function signOut() {
  await flushNow();
  const userId = currentUserId;
  await supabase!.auth.signOut();
  // não deixa cópia dos dados no navegador depois de sair
  if (userId) {
    try {
      localStorage.removeItem(cacheKey(userId));
    } catch {
      /* ignora */
    }
  }
}

/** Troca a senha de quem já está dentro da conta. */
export async function changePassword(password: string): Promise<string | null> {
  const { error } = await supabase!.auth.updateUser({ password });
  return error ? translateAuthError(error.message) : null;
}

/**
 * Junta à conta os itens dos dados antigos deste navegador (antes do login)
 * que ainda não existem nela. Não apaga nem altera nada que já está na conta.
 * Retorna quantos itens foram adicionados.
 */
export function mergeLegacyIntoAccount(): number {
  const legacy = legacyData();
  if (!legacy || !hydrated) return 0;
  const current = appStore.get();
  const collections = ["tasks", "projects", "notes", "videos", "creatives", "habits", "routines", "categories", "transactions", "bills", "goals", "scriptTemplates"] as const;
  let added = 0;
  const next = { ...current } as AppState;
  for (const key of collections) {
    const have = new Set((current[key] as { id: string }[]).map((item) => item.id));
    const extra = (legacy[key] as { id: string }[]).filter((item) => !have.has(item.id));
    if (extra.length) {
      (next[key] as { id: string }[]) = [...(current[key] as { id: string }[]), ...extra];
      added += extra.length;
    }
  }
  // registros de hábitos e rotina: só completa dias que a conta ainda não tem
  const habitLogs = { ...current.habitLogs };
  for (const [habitId, days] of Object.entries(legacy.habitLogs)) habitLogs[habitId] = { ...days, ...(habitLogs[habitId] || {}) };
  const routineLogs = { ...current.routineLogs };
  for (const [day, steps] of Object.entries(legacy.routineLogs)) routineLogs[day] = { ...steps, ...(routineLogs[day] || {}) };
  appStore.set({ ...next, habitLogs, routineLogs });
  return added;
}
