// Função do Supabase que atende os links de compartilhamento do quadro de Criativos.
//
// Quem abre o link não entra em conta nenhuma: esta função lê os dados do dono
// com a chave de serviço e devolve SÓ os criativos e o quadro. Nada de tarefas,
// finanças, agenda ou qualquer outro módulo sai daqui.
//
// IMPORTANTE: publique com "Verify JWT" DESLIGADO, porque quem visita não tem login.
//
// Ações (POST JSON):
//   view     { token, viewer? }                       → quadro, criativos e comentários
//   request  { token, viewer, name, email, message? } → pede permissão para comentar
//   comment  { token, viewer, cardId, body }          → comenta (só quem foi aprovado)

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_COMMENT = 2000;
const MAX_NAME = 80;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const env = (name: string) => (Deno.env.get(name) || "").trim();

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function serviceKey(): string {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
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

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

interface Share {
  id: string;
  owner_id: string;
  title: string;
  allow_comments: boolean;
}

async function findShare(db: SupabaseClient, token: string): Promise<Share> {
  if (!token || token.length < 10) throw new HttpError(404, "Link inválido.");
  const { data, error } = await db.from("board_shares").select("id, owner_id, title, allow_comments, revoked").eq("token", token).maybeSingle();
  if (error) throw new HttpError(500, "Não foi possível abrir este link agora.");
  if (!data) throw new HttpError(404, "Este link não existe. Confira o endereço.");
  if (data.revoked) throw new HttpError(404, "Este link foi desativado por quem compartilhou.");
  return data as Share;
}

async function findViewer(db: SupabaseClient, shareId: string, viewer: string) {
  if (!viewer) return null;
  const { data } = await db.from("share_viewers").select("id, name, status").eq("share_id", shareId).eq("viewer_key", viewer).maybeSingle();
  return data;
}

/** Só o quadro de criativos sai da conta do dono. */
function publicBoard(data: Record<string, unknown> | null) {
  const board = (data?.creativeBoard as Record<string, unknown>) || { columns: [], labels: [] };
  const creatives = Array.isArray(data?.creatives) ? (data!.creatives as Record<string, unknown>[]) : [];
  return {
    board: { columns: board.columns ?? [], labels: board.labels ?? [] },
    creatives: creatives.map((c) => ({
      id: c.id,
      title: c.title,
      columnId: c.columnId,
      order: c.order,
      labelIds: c.labelIds ?? [],
      cover: c.cover ?? "",
      pinned: !!c.pinned,
      stage: c.stage,
      format: c.format,
      size: c.size,
      client: c.client,
      channels: c.channels ?? [],
      startDate: c.startDate ?? null,
      dueDate: c.dueDate ?? null,
      dueTime: c.dueTime ?? "",
      dueDone: !!c.dueDone,
      checklist: c.checklist ?? [],
      briefing: c.briefing ?? [],
      headline: c.headline ?? "",
      bodyText: c.bodyText ?? "",
      cta: c.cta ?? "",
      slides: c.slides ?? [],
      moodboard: c.moodboard ?? [],
      references: c.references ?? [],
      palette: c.palette ?? [],
      fonts: c.fonts ?? "",
      fileUrl: c.fileUrl ?? "",
    })),
  };
}

async function handle(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "view");
  const db = adminClient();
  const token = text(body.token, 100);
  const viewerKey = text(body.viewer, 100);
  const share = await findShare(db, token);

  if (action === "view") {
    const { data: row } = await db.from("user_data").select("data").eq("user_id", share.owner_id).maybeSingle();
    const data = (row?.data as Record<string, unknown>) || null;
    const profile = (data?.profile as { name?: string }) || {};
    const viewer = await findViewer(db, share.id, viewerKey);
    const { data: comments } = await db
      .from("share_comments")
      .select("id, card_id, author, body, created_at")
      .eq("share_id", share.id)
      .order("created_at", { ascending: true });
    return reply({
      title: share.title,
      ownerName: text(profile.name, MAX_NAME),
      allowComments: share.allow_comments,
      viewer: viewer ? { status: viewer.status, name: viewer.name } : null,
      comments: comments ?? [],
      ...publicBoard(data),
    });
  }

  if (action === "request") {
    if (!share.allow_comments) throw new HttpError(403, "Quem compartilhou desligou os comentários neste link.");
    if (!viewerKey) throw new HttpError(400, "Pedido inválido.");
    const name = text(body.name, MAX_NAME);
    if (name.length < 2) throw new HttpError(400, "Escreva seu nome para pedir acesso.");
    const row = {
      share_id: share.id,
      viewer_key: viewerKey,
      name,
      email: text(body.email, 160),
      message: text(body.message, 500),
      status: "pending",
    };
    const existing = await findViewer(db, share.id, viewerKey);
    if (existing?.status === "approved") return reply({ status: "approved", name: existing.name });
    const { error } = await db.from("share_viewers").upsert(row, { onConflict: "share_id,viewer_key" });
    if (error) throw new HttpError(500, "Não foi possível enviar seu pedido agora.");
    return reply({ status: "pending", name });
  }

  if (action === "comment") {
    if (!share.allow_comments) throw new HttpError(403, "Os comentários estão desligados neste link.");
    const viewer = await findViewer(db, share.id, viewerKey);
    if (!viewer || viewer.status !== "approved") throw new HttpError(403, "Peça permissão para comentar.");
    const content = text(body.body, MAX_COMMENT);
    if (!content) throw new HttpError(400, "Escreva o comentário.");
    const { data, error } = await db
      .from("share_comments")
      .insert({ share_id: share.id, viewer_id: viewer.id, card_id: text(body.cardId, 60), author: viewer.name, body: content })
      .select("id, card_id, author, body, created_at")
      .single();
    if (error) throw new HttpError(500, "Não foi possível salvar o comentário.");
    return reply({ comment: data });
  }

  throw new HttpError(400, "Ação desconhecida.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
  try {
    return await handle(req);
  } catch (err) {
    const e = err as HttpError;
    return reply({ error: e.message || "Erro inesperado." }, e.status || 500);
  }
});
