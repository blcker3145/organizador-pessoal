/*
 * Compartilhar o quadro de Criativos por link.
 * - O dono cria e revoga links direto no banco (as regras de acesso só deixam ele mexer).
 * - Quem recebe o link fala com a função "share" do servidor, que devolve apenas os criativos.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { appUrl, supabase } from "./supabase";
import type { Block, BoardLabel, ChecklistItem, CreativeImage, CreativeSlide, VideoRef } from "./types";

const FUNCTION = "share";
const VIEWER_STORAGE = "organizador.viewer";

export interface ShareLink {
  id: string;
  token: string;
  title: string;
  allow_comments: boolean;
  revoked: boolean;
  created_at: string;
}

export interface ShareViewer {
  id: string;
  share_id: string;
  name: string;
  email: string;
  message: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
}

export interface ShareComment {
  id: string;
  card_id: string;
  author: string;
  body: string;
  created_at: string;
}

/** Só o que o link mostra: quadro, cards e comentários. */
export interface SharedBoard {
  title: string;
  ownerName: string;
  allowComments: boolean;
  viewer: { status: ShareViewer["status"]; name: string } | null;
  comments: ShareComment[];
  board: { columns: { id: string; title: string; cover?: string; coverTitle?: boolean }[]; labels: BoardLabel[] };
  creatives: SharedCreative[];
}

export interface SharedCreative {
  id: string;
  title: string;
  columnId: string | null;
  order: number;
  labelIds: string[];
  cover: string;
  pinned: boolean;
  stage: string;
  format: string;
  size: string;
  client: string;
  channels: string[];
  startDate: string | null;
  dueDate: string | null;
  dueTime: string;
  dueDone: boolean;
  checklist: ChecklistItem[];
  briefing: Block[];
  headline: string;
  bodyText: string;
  cta: string;
  slides: CreativeSlide[];
  moodboard: CreativeImage[];
  references: VideoRef[];
  palette: string[];
  fonts: string;
  fileUrl: string;
}

export class ShareError extends Error {}

/** Endereço que você manda para as pessoas. */
export const shareUrl = (token: string) => `${appUrl()}#/compartilhado/${token}`;

function newToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 28);
}

/** Código que identifica quem visita, guardado no navegador dela. Não é login. */
export function viewerKey(): string {
  try {
    const saved = localStorage.getItem(VIEWER_STORAGE);
    if (saved) return saved;
    const key = newToken();
    localStorage.setItem(VIEWER_STORAGE, key);
    return key;
  } catch {
    return "";
  }
}

type Backend = (body: Record<string, unknown>) => Promise<unknown>;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  // em desenvolvimento dá para simular o servidor (window.__shareMock)
  const mock = import.meta.env.DEV ? (window as unknown as { __shareMock?: Backend }).__shareMock : null;
  if (typeof mock === "function") return (await mock(body)) as T;
  if (!supabase) throw new ShareError("O servidor ainda não foi configurado.");
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body });
  if (error) {
    let message = "";
    if (error instanceof FunctionsHttpError) {
      try {
        message = (await error.context.json())?.error || "";
      } catch {
        /* resposta sem JSON */
      }
    }
    throw new ShareError(message || "Não foi possível falar com o servidor agora.");
  }
  return data as T;
}

/* ---------- quem visita ---------- */

export const fetchSharedBoard = (token: string) => call<SharedBoard>({ action: "view", token, viewer: viewerKey() });

export const requestComments = (token: string, name: string, email: string, message: string) =>
  call<{ status: ShareViewer["status"]; name: string }>({ action: "request", token, viewer: viewerKey(), name, email, message });

export const postComment = (token: string, cardId: string, body: string) =>
  call<{ comment: ShareComment }>({ action: "comment", token, viewer: viewerKey(), cardId, body });

/* ---------- o dono ---------- */

function db() {
  if (!supabase) throw new ShareError("O servidor ainda não foi configurado.");
  return supabase;
}

/** Erro comum quando o SQL do compartilhamento ainda não foi rodado. */
const missingTable = (message: string) => /schema cache|does not exist|relation .* does not exist/i.test(message);

export async function listShares(): Promise<ShareLink[]> {
  const { data, error } = await db().from("board_shares").select("*").order("created_at", { ascending: false });
  if (error) throw new ShareError(missingTable(error.message) ? "Falta rodar o SQL do compartilhamento no Supabase (0003_compartilhar.sql)." : error.message);
  return (data || []) as ShareLink[];
}

export async function createShare(title = "Criativos"): Promise<ShareLink> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) throw new ShareError("Entre na sua conta para compartilhar.");
  const { data, error } = await db().from("board_shares").insert({ owner_id: user.id, token: newToken(), title }).select("*").single();
  if (error) throw new ShareError(missingTable(error.message) ? "Falta rodar o SQL do compartilhamento no Supabase (0003_compartilhar.sql)." : error.message);
  return data as ShareLink;
}

export async function updateShare(id: string, patch: Partial<Pick<ShareLink, "title" | "allow_comments" | "revoked">>) {
  const { error } = await db().from("board_shares").update(patch).eq("id", id);
  if (error) throw new ShareError(error.message);
}

export async function deleteShare(id: string) {
  const { error } = await db().from("board_shares").delete().eq("id", id);
  if (error) throw new ShareError(error.message);
}

export async function listViewers(shareIds: string[]): Promise<ShareViewer[]> {
  if (!shareIds.length) return [];
  const { data, error } = await db().from("share_viewers").select("*").in("share_id", shareIds).order("created_at", { ascending: false });
  if (error) throw new ShareError(error.message);
  return (data || []) as ShareViewer[];
}

export async function setViewerStatus(id: string, status: ShareViewer["status"]) {
  const { error } = await db().from("share_viewers").update({ status }).eq("id", id);
  if (error) throw new ShareError(error.message);
}

export async function listShareComments(shareIds: string[]): Promise<ShareComment[]> {
  if (!shareIds.length) return [];
  const { data, error } = await db().from("share_comments").select("*").in("share_id", shareIds).order("created_at", { ascending: false });
  if (error) throw new ShareError(error.message);
  return (data || []) as ShareComment[];
}

export async function deleteShareComment(id: string) {
  const { error } = await db().from("share_comments").delete().eq("id", id);
  if (error) throw new ShareError(error.message);
}

/** Quantos pedidos de comentário estão esperando resposta (para o sino de avisos). */
export async function countPendingRequests(): Promise<number> {
  try {
    const shares = await listShares();
    const live = shares.filter((s) => !s.revoked);
    if (!live.length) return 0;
    const viewers = await listViewers(live.map((s) => s.id));
    return viewers.filter((v) => v.status === "pending").length;
  } catch {
    return 0;
  }
}
