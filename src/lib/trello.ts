/*
 * Importação do Trello para o quadro de criativos.
 * Aceita o arquivo JSON exportado pelo Trello ou uma conexão direta pela API
 * (chave + token de leitura, usados só durante a importação e nunca salvos).
 */
import { markdownToBlocks } from "./ai";
import { boardFieldDefaults, LABEL_COLORS, newColumn } from "./board";
import { imageFileToDataUrl } from "./creatives";
import { appStore, setState } from "./store";
import type { AppState, BoardLabel, Creative, CreativeStage, LabelColor } from "./types";
import { normalize, uid } from "./util";

/* ---------- Formato do Trello (só o que usamos) ---------- */

interface TAttachment {
  id: string;
  name?: string;
  url?: string;
  mimeType?: string;
  isUpload?: boolean;
  previews?: { url?: string; width?: number }[];
}
interface TCard {
  id: string;
  name: string;
  desc?: string;
  closed?: boolean;
  idList: string;
  idLabels?: string[];
  due?: string | null;
  start?: string | null;
  dueComplete?: boolean;
  pos?: number;
  cover?: { idAttachment?: string | null; url?: string | null; scaled?: { url?: string; width?: number }[] | null } | null;
  attachments?: TAttachment[];
}
interface TChecklist {
  id: string;
  idCard: string;
  name?: string;
  pos?: number;
  checkItems?: { name: string; state: string; pos?: number }[];
}
export interface TrelloBoardData {
  name?: string;
  prefs?: { backgroundImage?: string | null; backgroundImageScaled?: { url: string; width: number }[] | null };
  lists?: { id: string; name: string; closed?: boolean; pos?: number }[];
  labels?: { id: string; name?: string; color?: string | null }[];
  cards?: TCard[];
  checklists?: TChecklist[];
}

export interface TrelloAuth {
  key: string;
  token: string;
}

export interface ImportOptions {
  /** o 1º cartão com imagem de cada lista vira a capa fixa da lista */
  firstCoverAsListCover: boolean;
  /** baixa as imagens para o Organizador (só com a conexão direta) */
  downloadImages: boolean;
  importBackground: boolean;
}

export interface ImportSummary {
  lists: number;
  labels: number;
  created: number;
  updated: number;
  images: number;
  imagesFailed: number;
}

/* ---------- API ---------- */

const API = "https://api.trello.com/1";

async function api<T>(path: string, auth: TrelloAuth, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // a chave e o token vão no cabeçalho, não no endereço
  const res = await fetch(url, { headers: { Authorization: `OAuth oauth_consumer_key="${auth.key.trim()}", oauth_token="${auth.token.trim()}"` } });
  if (res.status === 401 || res.status === 400) throw new Error("O Trello recusou a chave ou o token. Gere um token novo e tente de novo.");
  if (res.status === 404) throw new Error("Quadro não encontrado no Trello.");
  if (res.status === 429) throw new Error("Muitos pedidos ao Trello. Espere um minuto.");
  if (!res.ok) throw new Error(`O Trello respondeu com erro (${res.status}).`);
  return res.json();
}

export function trelloTokenUrl(key: string) {
  const url = new URL("https://trello.com/1/authorize");
  url.search = new URLSearchParams({ expiration: "1day", name: "Organizador", scope: "read", response_type: "token", key: key.trim() }).toString();
  return url.toString();
}

export async function listTrelloBoards(auth: TrelloAuth) {
  return api<{ id: string; name: string; url: string; closed: boolean }[]>("/members/me/boards", auth, { filter: "open", fields: "name,url,closed" });
}

export async function fetchTrelloBoard(auth: TrelloAuth, boardId: string): Promise<TrelloBoardData> {
  return api<TrelloBoardData>(`/boards/${encodeURIComponent(boardId)}`, auth, {
    fields: "name,prefs",
    lists: "open",
    list_fields: "name,pos,closed",
    labels: "all",
    label_fields: "name,color",
    cards: "open",
    card_fields: "name,desc,due,start,dueComplete,idList,idLabels,pos,cover,closed",
    card_attachments: "true",
    card_attachment_fields: "name,url,mimeType,isUpload,previews",
    checklists: "all",
    checklist_fields: "name,idCard,pos",
  });
}

/** Lê o arquivo exportado pelo Trello (Menu → Imprimir, exportar e compartilhar → Exportar como JSON). */
export async function readTrelloFile(file: File): Promise<TrelloBoardData> {
  let data: TrelloBoardData;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Esse arquivo não é um JSON válido.");
  }
  if (!Array.isArray(data.lists) || !Array.isArray(data.cards)) throw new Error("Esse arquivo não parece ser a exportação de um quadro do Trello.");
  return data;
}

/* ---------- Conversão ---------- */

const isImage = (a: TAttachment) => /^image\//.test(a.mimeType || "") || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(a.url || a.name || "");

function coverOf(card: TCard): TAttachment | null {
  const id = card.cover?.idAttachment;
  if (id) return card.attachments?.find((a) => a.id === id) || null;
  if (card.cover?.scaled?.length) {
    const best = [...card.cover.scaled].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    return best?.url ? { id: "unsplash", url: best.url, mimeType: "image/jpeg" } : null;
  }
  return null;
}

/** Melhor endereço de imagem: prévia de ~600px quando existir. */
function imageUrl(a: TAttachment): string {
  const previews = (a.previews || []).filter((p) => p.url && (p.width || 0) >= 300).sort((x, y) => (x.width || 0) - (y.width || 0));
  return previews[0]?.url || a.url || "";
}

async function downloadImage(url: string, auth: TrelloAuth | null): Promise<string | null> {
  try {
    const needsAuth = /(^https:\/\/)(api\.)?trello\.com\//.test(url);
    if (needsAuth && !auth) return null;
    const res = await fetch(needsAuth ? url.replace("https://trello.com/1/", `${API}/`) : url, {
      headers: needsAuth && auth ? { Authorization: `OAuth oauth_consumer_key="${auth.key.trim()}", oauth_token="${auth.token.trim()}"` } : undefined,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await imageFileToDataUrl(new File([blob], "capa", { type: blob.type }), 1000, 0.8);
  } catch {
    return null;
  }
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

function guessFormat(name: string): { format: string; size: string } {
  const n = normalize(name);
  if (/carross?el/.test(n)) return { format: "Carrossel", size: "1080×1350" };
  if (/story|stories|reels/.test(n)) return { format: "Story / Reels", size: "1080×1920" };
  if (/thumb/.test(n)) return { format: "Thumbnail YouTube", size: "1280×720" };
  if (/banner/.test(n)) return { format: "Banner site", size: "1920×600" };
  return { format: "Post feed", size: "1080×1350" };
}

const trelloColor = (c: string | null | undefined): LabelColor => (c && c in LABEL_COLORS ? (c as LabelColor) : "black");

/**
 * Traz listas, etiquetas e cartões para o quadro.
 * Listas e etiquetas com o mesmo nome são reaproveitadas; cartões já importados são atualizados.
 */
export async function importTrelloBoard(
  data: TrelloBoardData,
  opts: ImportOptions,
  auth: TrelloAuth | null,
  onProgress?: (text: string) => void,
): Promise<ImportSummary> {
  const state = appStore.get();
  const board = { ...state.creativeBoard, columns: [...state.creativeBoard.columns], labels: [...state.creativeBoard.labels] };
  const summary: ImportSummary = { lists: 0, labels: 0, created: 0, updated: 0, images: 0, imagesFailed: 0 };

  // listas
  const listMap = new Map<string, string>();
  const lists = (data.lists || []).filter((l) => !l.closed).sort((a, b) => (a.pos || 0) - (b.pos || 0));
  for (const l of lists) {
    let col = board.columns.find((c) => normalize(c.title) === normalize(l.name));
    if (!col) {
      col = { ...newColumn(l.name), done: /postado|publicado|conclu|entregue|finaliz/.test(normalize(l.name)) };
      board.columns.push(col);
      summary.lists++;
    }
    listMap.set(l.id, col.id);
  }

  // etiquetas
  const labelMap = new Map<string, string>();
  for (const l of data.labels || []) {
    const color = trelloColor(l.color);
    const name = (l.name || "").trim();
    let found: BoardLabel | undefined = board.labels.find((x) => normalize(x.name) === normalize(name) && (name || x.color === color));
    if (!found) {
      found = { id: uid(), name, color };
      board.labels.push(found);
      summary.labels++;
    }
    labelMap.set(l.id, found.id);
  }

  // checklists por cartão
  const checklists = new Map<string, TChecklist[]>();
  for (const cl of data.checklists || []) checklists.set(cl.idCard, [...(checklists.get(cl.idCard) || []), cl]);

  const cards = (data.cards || []).filter((c) => !c.closed && listMap.has(c.idList)).sort((a, b) => (a.pos || 0) - (b.pos || 0));
  const existing = new Map(state.creatives.filter((c) => c.trelloId).map((c) => [c.trelloId!, c]));
  const coverTaken = new Set<string>();
  const imported: Creative[] = [];
  const updated = new Map<string, Partial<Creative>>();

  let i = 0;
  for (const card of cards) {
    i++;
    onProgress?.(`Importando cartão ${i} de ${cards.length}…`);
    const columnId = listMap.get(card.idList)!;
    const column = board.columns.find((c) => c.id === columnId)!;

    let cover: string | null = null;
    let isHeader = false;
    const coverAtt = coverOf(card);
    if (coverAtt) {
      const url = imageUrl(coverAtt);
      if (opts.downloadImages && url) {
        const data64 = await downloadImage(url, auth);
        if (data64) {
          cover = data64;
          summary.images++;
        } else {
          cover = url;
          summary.imagesFailed++;
        }
      } else cover = url || null;
    }

    // 1º cartão com imagem (sem etiqueta nem prazo) vira a capa da lista
    if (opts.firstCoverAsListCover && cover && !coverTaken.has(columnId) && !(card.idLabels || []).length && !card.due) {
      coverTaken.add(columnId);
      isHeader = true;
      // numa nova importação, mantém a capa que a pessoa já tem
      if (!column.cover) {
        column.cover = cover;
        column.coverTitle = false;
      }
      // o conteúdo do cartão continua no quadro, sem repetir a imagem
      cover = null;
    } else if (cover) coverTaken.add(columnId);

    const items = (checklists.get(card.id) || [])
      .sort((a, b) => (a.pos || 0) - (b.pos || 0))
      .flatMap((cl) => (cl.checkItems || []).sort((a, b) => (a.pos || 0) - (b.pos || 0)).map((it) => ({ id: uid(), text: it.name, done: it.state === "complete" })));
    const links = (card.attachments || []).filter((a) => a.url && !isImage(a) && a.id !== coverAtt?.id);
    const due = card.due ? localDate(card.due) : null;
    const stage: CreativeStage = column.done ? "entregue" : card.dueComplete ? "aprovado" : (card.idLabels || []).length ? "criacao" : "ideia";

    const fields: Partial<Creative> = {
      title: card.name,
      columnId,
      order: card.pos || i,
      labelIds: (card.idLabels || []).map((id) => labelMap.get(id)).filter((x): x is string => !!x),
      cover,
      dueDate: due?.date || null,
      dueTime: due?.time || "",
      startDate: card.start ? localDate(card.start).date : null,
      dueDone: !!card.dueComplete,
      checklist: items,
      stage,
    };

    const prev = existing.get(card.id);
    if (prev) {
      updated.set(prev.id, { ...fields, cover: isHeader ? null : fields.cover || prev.cover, briefing: card.desc ? markdownToBlocks(card.desc) : prev.briefing, updatedAt: Date.now() });
      summary.updated++;
      continue;
    }
    const { format, size } = guessFormat(card.name);
    imported.push({
      ...boardFieldDefaults(),
      id: uid(),
      title: card.name,
      stage,
      format,
      size,
      channels: ["Instagram"],
      client: "",
      dueDate: null,
      briefing: card.desc ? markdownToBlocks(card.desc) : [],
      headline: "",
      bodyText: "",
      cta: "",
      slides: [],
      palette: [],
      fonts: "",
      moodboard: [],
      references: links.map((a) => ({ id: uid(), label: a.name || "Anexo do Trello", url: a.url! })),
      fileUrl: "",
      noteId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...fields,
      trelloId: card.id,
    } as Creative);
    summary.created++;
  }

  if (opts.importBackground) {
    const bg = data.prefs?.backgroundImageScaled?.slice().sort((a, b) => b.width - a.width).find((x) => x.width <= 2000)?.url || data.prefs?.backgroundImage;
    if (bg) board.background = bg;
  }

  setState((s: AppState) => ({
    ...s,
    creativeBoard: board,
    creatives: [...s.creatives.map((c) => (updated.has(c.id) ? { ...c, ...updated.get(c.id) } : c)), ...imported],
  }));
  return summary;
}
