/* Quadro de criativos no estilo Trello: listas com capa, etiquetas e cartões. */
import type { AppState, BoardColumn, BoardLabel, ChecklistItem, Creative, CreativeBoard, CreativeStage, LabelColor } from "./types";
import { uid } from "./util";

/** Cores das etiquetas, com os mesmos nomes do Trello. */
export const LABEL_COLORS: Record<LabelColor, { bg: string; fg: string; name: string }> = {
  green: { bg: "#4bce97", fg: "#1d2125", name: "Verde" },
  yellow: { bg: "#f5cd47", fg: "#1d2125", name: "Amarelo" },
  orange: { bg: "#fea362", fg: "#1d2125", name: "Laranja" },
  red: { bg: "#f87168", fg: "#1d2125", name: "Vermelho" },
  purple: { bg: "#9f8fef", fg: "#1d2125", name: "Roxo" },
  blue: { bg: "#579dff", fg: "#1d2125", name: "Azul" },
  sky: { bg: "#6cc3e0", fg: "#1d2125", name: "Céu" },
  lime: { bg: "#94c748", fg: "#1d2125", name: "Lima" },
  pink: { bg: "#e774bb", fg: "#1d2125", name: "Rosa" },
  black: { bg: "#8c9bab", fg: "#1d2125", name: "Cinza" },
  green_light: { bg: "#baf3db", fg: "#164b35", name: "Verde claro" },
  yellow_light: { bg: "#f8e6a0", fg: "#533f04", name: "Amarelo claro" },
  orange_light: { bg: "#fedec8", fg: "#702e00", name: "Laranja claro" },
  red_light: { bg: "#ffd5d2", fg: "#5d1f1a", name: "Vermelho claro" },
  purple_light: { bg: "#dfd8fd", fg: "#352c63", name: "Roxo claro" },
  blue_light: { bg: "#cce0ff", fg: "#09326c", name: "Azul claro" },
  sky_light: { bg: "#c6edfb", fg: "#164555", name: "Céu claro" },
  lime_light: { bg: "#d3f1a7", fg: "#37471f", name: "Lima claro" },
  pink_light: { bg: "#fdd0ec", fg: "#50253f", name: "Rosa claro" },
  black_light: { bg: "#dcdfe4", fg: "#172b4d", name: "Cinza claro" },
  green_dark: { bg: "#1f845a", fg: "#ffffff", name: "Verde escuro" },
  yellow_dark: { bg: "#946f00", fg: "#ffffff", name: "Amarelo escuro" },
  orange_dark: { bg: "#c25100", fg: "#ffffff", name: "Laranja escuro" },
  red_dark: { bg: "#c9372c", fg: "#ffffff", name: "Vermelho escuro" },
  purple_dark: { bg: "#6e5dc6", fg: "#ffffff", name: "Roxo escuro" },
  blue_dark: { bg: "#0c66e4", fg: "#ffffff", name: "Azul escuro" },
  sky_dark: { bg: "#227d9b", fg: "#ffffff", name: "Céu escuro" },
  lime_dark: { bg: "#5b7f24", fg: "#ffffff", name: "Lima escuro" },
  pink_dark: { bg: "#ae4787", fg: "#ffffff", name: "Rosa escuro" },
  black_dark: { bg: "#626f86", fg: "#ffffff", name: "Cinza escuro" },
};

export const labelStyle = (color: LabelColor) => {
  const c = LABEL_COLORS[color] || LABEL_COLORS.black;
  return { background: c.bg, color: c.fg };
};

const COL = { today: "col-today", docs: "col-docs", design: "col-design", agendado: "col-agendado", postado: "col-postado" };

/** Estrutura inicial igual ao quadro "Gestão de projetos" do Trello. */
export function defaultCreativeBoard(): CreativeBoard {
  const col = (id: string, title: string, done = false): BoardColumn => ({ id, title, cover: null, coverTitle: true, done });
  const label = (id: string, name: string, color: LabelColor): BoardLabel => ({ id, name, color });
  return {
    columns: [col(COL.today, "TO DAY"), col(COL.docs, "DOCS"), col(COL.design, "DESIGN GRÁFICO"), col(COL.agendado, "AGENDADO"), col(COL.postado, "POSTADO", true)],
    labels: [
      label("lbl-finalizado", "FINALIZADO", "lime"),
      label("lbl-sendo-feito", "SENDO FEITO", "green_light"),
      label("lbl-atencao", "ATENÇÃO", "blue"),
      label("lbl-aprovacao", "PARA APROVAÇÃO", "yellow_light"),
      label("lbl-alteracao", "ALTERAÇÃO", "orange_light"),
      label("lbl-atrasado", "ATRASADO", "red"),
      label("lbl-aguardando", "AGUARDANDO INFO", "black"),
    ],
    background: null,
  };
}

/** Campos do quadro com valores padrão, para criativos novos e antigos. */
export function boardFieldDefaults(): Pick<
  Creative,
  "columnId" | "order" | "labelIds" | "cover" | "pinned" | "startDate" | "dueTime" | "dueDone" | "checklist" | "trelloId"
> {
  return { columnId: null, order: Date.now(), labelIds: [], cover: null, pinned: false, startDate: null, dueTime: "", dueDone: false, checklist: [], trelloId: null };
}

const STAGE_COLUMN: Record<CreativeStage, string> = {
  ideia: COL.today,
  briefing: COL.today,
  criacao: COL.design,
  revisao: COL.design,
  aprovado: COL.agendado,
  entregue: COL.postado,
};

/** Lista padrão para um criativo sem lista (dados antigos, IA, etc.). */
export function columnForStage(board: CreativeBoard, stage: CreativeStage): string | null {
  const cols = board.columns;
  if (!cols.length) return null;
  const mapped = cols.find((c) => c.id === STAGE_COLUMN[stage]);
  if (mapped) return mapped.id;
  if (stage === "entregue") return (cols.find((c) => c.done) || cols[cols.length - 1]).id;
  return cols[0].id;
}

/** Completa campos que faltam nos dados salvos antes do quadro existir. */
export function normalizeBoardState(s: AppState): AppState {
  const valid = !!s.creativeBoard && Array.isArray(s.creativeBoard.columns) && Array.isArray(s.creativeBoard.labels);
  const board: CreativeBoard = valid ? s.creativeBoard : defaultCreativeBoard();
  const needs = s.creatives.some((c) => c.labelIds === undefined || !board.columns.some((col) => col.id === c.columnId));
  if (valid && !needs) return s;
  const creatives = s.creatives.map((c, i) => {
    const full = { ...boardFieldDefaults(), ...c } as Creative;
    if (c.order === undefined) full.order = c.createdAt || i;
    if (!full.columnId || !board.columns.some((col) => col.id === full.columnId)) full.columnId = columnForStage(board, full.stage);
    return full;
  });
  return { ...s, creativeBoard: board, creatives };
}

/** Ordem de exibição numa lista: fixados primeiro, depois a posição. */
export function sortCards(cards: Creative[]): Creative[] {
  return [...cards].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
}

export type DueState = "none" | "done" | "overdue" | "soon" | "later";

/** Situação do prazo, como as cores de data do Trello. */
export function dueState(c: Creative, now = new Date()): DueState {
  if (!c.dueDate) return "none";
  if (c.dueDone || c.stage === "entregue") return "done";
  const [y, m, d] = c.dueDate.split("-").map(Number);
  const [hh, mm] = (c.dueTime || "23:59").split(":").map(Number);
  const due = new Date(y, m - 1, d, hh, mm);
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff < 24 * 3600_000) return "soon";
  return "later";
}

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const dayMonth = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]}`;
};

/** Texto da data no cartão: "15 de set. - 16 de set." */
export function dueText(c: Creative): string {
  if (!c.dueDate) return c.startDate ? `Início: ${dayMonth(c.startDate)}` : "";
  if (c.startDate && c.startDate < c.dueDate) return `${dayMonth(c.startDate)} - ${dayMonth(c.dueDate)}`;
  return dayMonth(c.dueDate);
}

export const checklistProgress = (items: ChecklistItem[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

/** Quantos anexos/links o cartão tem (moodboard, referências e arquivo). */
export const attachmentCount = (c: Creative) => c.moodboard.length + c.references.length + (c.fileUrl ? 1 : 0);

export const newColumn = (title: string): BoardColumn => ({ id: uid(), title, cover: null, coverTitle: true, done: false });
