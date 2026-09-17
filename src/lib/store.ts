import { createStore } from "./createStore";
import { BRIEFING_SECTIONS } from "./creatives";
import { addDays, addMonths, today } from "./dates";
import { createSeed, emptyState } from "./seed";
import type {
  AppState,
  Block,
  Creative,
  FavoriteKind,
  Habit,
  Note,
  NoteKind,
  Task,
  Transaction,
  Video,
} from "./types";
import { textBlock, uid } from "./util";
import { boardFieldDefaults, columnForStage, normalizeBoardState } from "./board";
import { flattenMarkdownLinks } from "./links";

export const STATE_VERSION = 1;

/** Garante que dados antigos ou incompletos tenham todos os campos atuais. */
export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as AppState;
  if (parsed.version !== STATE_VERSION || !Array.isArray(parsed.tasks)) return null;
  return fixImportedLinks(normalizeBoardState({ ...emptyState(), ...parsed }));
}

/** Links importados do Trello vinham como [url](url "…"): deixa só o endereço. */
function fixImportedLinks(s: AppState): AppState {
  const needs = s.creatives.some((c) => c.briefing.some((b) => b.text.includes("](http")));
  if (!needs) return s;
  return {
    ...s,
    creatives: s.creatives.map((c) =>
      c.briefing.some((b) => b.text.includes("](http")) ? { ...c, briefing: c.briefing.map((b) => ({ ...b, text: flattenMarkdownLinks(b.text) })) } : c,
    ),
  };
}

// O estado começa vazio; a sessão (sync.ts) carrega os dados da conta ao entrar.
export const appStore = createStore<AppState>(emptyState());
export const useApp = appStore.use;

type Collection = "tasks" | "projects" | "notes" | "videos" | "creatives" | "events" | "scriptTemplates" | "habits" | "routines" | "categories" | "transactions" | "bills" | "goals";
type ItemOf<K extends Collection> = AppState[K][number];

const update = (fn: (s: AppState) => AppState) => appStore.set(fn);

export function insert<K extends Collection>(key: K, item: ItemOf<K>, atStart = false) {
  update((s) => ({ ...s, [key]: atStart ? [item, ...s[key]] : [...s[key], item] }));
}

export function patch<K extends Collection>(key: K, id: string, changes: Partial<ItemOf<K>>) {
  update((s) => ({
    ...s,
    [key]: (s[key] as { id: string }[]).map((it) => (it.id === id ? { ...it, ...changes } : it)),
  }));
}

export function remove<K extends Collection>(key: K, id: string) {
  update((s) => ({ ...s, [key]: (s[key] as { id: string }[]).filter((it) => it.id !== id) }));
}

export function setState(fn: (s: AppState) => AppState) {
  update(fn);
}

export function replaceState(next: AppState) {
  appStore.set(normalizeBoardState({ ...emptyState(), ...next, version: STATE_VERSION }));
}

/* ---------------- Tarefas ---------------- */

export function newTask(partial: Partial<Task> = {}): Task {
  return {
    id: uid(),
    title: "",
    status: "todo",
    priority: null,
    date: null,
    projectId: null,
    videoId: null,
    creativeId: null,
    noteId: null,
    tags: [],
    subtasks: [],
    body: [textBlock()],
    repeat: "none",
    focusDate: null,
    createdAt: Date.now(),
    completedAt: null,
    ...partial,
  };
}

export function createTask(partial: Partial<Task> = {}): Task {
  const t = newTask(partial);
  insert("tasks", t);
  return t;
}

function nextRepeatDate(t: Task): string | null {
  if (!t.date || t.repeat === "none") return null;
  let d = t.date;
  const step = (x: string) =>
    t.repeat === "daily" ? addDays(x, 1) : t.repeat === "weekly" ? addDays(x, 7) : addMonths(x, 1);
  d = step(d);
  const now = today();
  while (d < now) d = step(d);
  return d;
}

export function setTaskStatus(id: string, status: Task["status"]) {
  const task = appStore.get().tasks.find((t) => t.id === id);
  if (!task) return;
  const wasDone = task.status === "done";
  patch("tasks", id, { status, completedAt: status === "done" ? Date.now() : null });
  if (status === "done" && !wasDone && task.repeat !== "none") {
    const next = nextRepeatDate(task);
    if (next) {
      createTask({
        ...task,
        id: uid(),
        status: "todo",
        date: next,
        focusDate: null,
        completedAt: null,
        createdAt: Date.now(),
        subtasks: task.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
      });
    }
  }
}

export function toggleTask(id: string) {
  const task = appStore.get().tasks.find((t) => t.id === id);
  if (!task) return;
  setTaskStatus(id, task.status === "done" ? "todo" : "done");
}

export const FOCUS_LIMIT = 3;

/** Retorna false quando o foco do dia já está cheio. */
export function toggleFocus(id: string): boolean {
  const s = appStore.get();
  const d = today();
  const task = s.tasks.find((t) => t.id === id);
  if (!task) return false;
  if (task.focusDate === d) {
    patch("tasks", id, { focusDate: null });
    return true;
  }
  const count = s.tasks.filter((t) => t.focusDate === d).length;
  if (count >= FOCUS_LIMIT) return false;
  patch("tasks", id, { focusDate: d, date: task.date && task.date <= d ? task.date : d });
  return true;
}

export function ensureProject(name: string): string {
  const s = appStore.get();
  const found = s.projects.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return found.id;
  const id = uid();
  insert("projects", { id, name: name.trim() });
  return id;
}

/* ---------------- Notas ---------------- */

export function createNote(partial: Partial<Note> = {}): Note {
  const n: Note = {
    id: uid(),
    title: "",
    kind: "ideia" as NoteKind,
    tags: [],
    pinned: false,
    body: [textBlock()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    converted: [],
    ...partial,
  };
  insert("notes", n, true);
  return n;
}

export function patchNote(id: string, changes: Partial<Note>) {
  patch("notes", id, { ...changes, updatedAt: Date.now() });
}

export function noteToTask(noteId: string): Task | null {
  const note = appStore.get().notes.find((n) => n.id === noteId);
  if (!note) return null;
  const task = createTask({
    title: note.title || "Sem título",
    noteId: note.id,
    tags: [...note.tags],
    body: note.body.map((b) => ({ ...b, id: uid() })),
  });
  patchNote(noteId, { converted: [...note.converted, { kind: "task", id: task.id }] });
  return task;
}

export function noteToVideo(noteId: string): Video | null {
  const note = appStore.get().notes.find((n) => n.id === noteId);
  if (!note) return null;
  const stripped = (note.title || "Sem título").replace(/^v[íi]deo:\s*/i, "");
  const title = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  const video = createVideo({ title, noteId: note.id, script: note.body.map((b) => ({ ...b, id: uid() })) });
  patchNote(noteId, { converted: [...note.converted, { kind: "video", id: video.id }] });
  return video;
}

/* ---------------- Vídeos ---------------- */

export function createVideo(partial: Partial<Video> = {}): Video {
  const v: Video = {
    id: uid(),
    title: "",
    stage: "ideia",
    platforms: ["YouTube"],
    format: "longo",
    publishDate: null,
    publishTime: "18:00",
    script: [textBlock()],
    references: [],
    caption: "",
    publishedUrl: "",
    noteId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
  insert("videos", v);
  return v;
}

export function patchVideo(id: string, changes: Partial<Video>) {
  patch("videos", id, { ...changes, updatedAt: Date.now() });
}

export function templateBlocks(sections: string[]): Block[] {
  const blocks: Block[] = [];
  sections.forEach((name) => {
    blocks.push(textBlock(name, "h2"));
    blocks.push(textBlock());
  });
  return blocks;
}

/** Cria Gravar/Editar/Thumbnail/Publicar antes da data de publicação. Retorna quantas foram criadas. */
export function generateProductionTasks(videoId: string): number {
  const s = appStore.get();
  const video = s.videos.find((v) => v.id === videoId);
  if (!video || !video.publishDate) return 0;
  const project = s.projects.find((p) => p.name === "Vídeos");
  const projectId = project ? project.id : ensureProject("Vídeos");
  const now = today();
  const plan: [string, number][] = [
    ["Gravar", -3],
    ["Editar", -2],
    ["Thumbnail", -1],
    ["Publicar", 0],
  ];
  const existing = s.tasks.filter((t) => t.videoId === videoId).map((t) => t.title.split(":")[0]);
  let created = 0;
  plan.forEach(([verb, offset]) => {
    if (existing.includes(verb)) return;
    let date = addDays(video.publishDate!, offset);
    if (date < now) date = now;
    createTask({ title: `${verb}: ${video.title || "vídeo"}`, date, videoId, projectId, priority: "media" });
    created++;
  });
  return created;
}

/* ---------------- Criativos ---------------- */

export function createCreative(partial: Partial<Creative> = {}): Creative {
  const board = appStore.get().creativeBoard;
  const c: Creative = {
    ...boardFieldDefaults(),
    id: uid(),
    title: "",
    stage: "ideia",
    format: "Post feed",
    size: "1080×1350",
    channels: ["Instagram"],
    client: "",
    dueDate: null,
    briefing: templateBlocks(BRIEFING_SECTIONS),
    headline: "",
    bodyText: "",
    cta: "",
    slides: [],
    palette: [],
    fonts: "",
    moodboard: [],
    references: [],
    fileUrl: "",
    noteId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
  if (!c.columnId || !board.columns.some((col) => col.id === c.columnId)) c.columnId = columnForStage(board, c.stage);
  insert("creatives", c);
  return c;
}

export function patchCreative(id: string, changes: Partial<Creative>) {
  patch("creatives", id, { ...changes, updatedAt: Date.now() });
}

export function deleteCreative(id: string) {
  update((s) => ({
    ...s,
    creatives: s.creatives.filter((c) => c.id !== id),
    tasks: s.tasks.map((t) => (t.creativeId === id ? { ...t, creativeId: null } : t)),
    favorites: s.favorites.filter((f) => !(f.kind === "creative" && f.id === id)),
  }));
}

export function noteToCreative(noteId: string): Creative | null {
  const note = appStore.get().notes.find((n) => n.id === noteId);
  if (!note) return null;
  const stripped = (note.title || "Sem título").replace(/^(criativo|arte):s*/i, "");
  const title = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  const hasText = note.body.some((b) => b.text.trim());
  const creative = createCreative({
    title,
    noteId: note.id,
    ...(hasText ? { briefing: [...note.body.map((b) => ({ ...b, id: uid() })), ...templateBlocks(BRIEFING_SECTIONS)] } : {}),
  });
  patchNote(noteId, { converted: [...note.converted, { kind: "creative", id: creative.id }] });
  return creative;
}

/** Cria Briefing/Criar/Revisar/Entregar antes da data de entrega. Retorna quantas foram criadas. */
export function generateCreativeTasks(creativeId: string): number {
  const s = appStore.get();
  const creative = s.creatives.find((c) => c.id === creativeId);
  if (!creative || !creative.dueDate) return 0;
  const project = s.projects.find((p) => p.name === "Design");
  const projectId = project ? project.id : ensureProject("Design");
  const now = today();
  const plan: [string, number][] = [
    ["Fechar briefing", -4],
    ["Criar", -2],
    ["Revisar", -1],
    ["Entregar", 0],
  ];
  const existing = s.tasks.filter((t) => t.creativeId === creativeId).map((t) => t.title.split(":")[0]);
  let created = 0;
  plan.forEach(([verb, offset]) => {
    if (existing.includes(verb)) return;
    let date = addDays(creative.dueDate!, offset);
    if (date < now) date = now;
    createTask({ title: `${verb}: ${creative.title || "criativo"}`, date, creativeId, projectId, priority: "media" });
    created++;
  });
  return created;
}

/* ---------------- Favoritos ---------------- */

export function isFavorite(state: AppState, kind: FavoriteKind, id: string) {
  return state.favorites.some((f) => f.kind === kind && f.id === id);
}

export function toggleFavorite(kind: FavoriteKind, id: string) {
  update((s) => ({
    ...s,
    favorites: isFavorite(s, kind, id)
      ? s.favorites.filter((f) => !(f.kind === kind && f.id === id))
      : [...s.favorites, { kind, id }],
  }));
}

/* ---------------- Hábitos e rotina ---------------- */

export function setHabitValue(habitId: string, date: string, value: number) {
  update((s) => {
    const logs = { ...(s.habitLogs[habitId] || {}) };
    if (value > 0) logs[date] = value;
    else delete logs[date];
    return { ...s, habitLogs: { ...s.habitLogs, [habitId]: logs } };
  });
}

export function toggleHabit(habit: Habit, date: string) {
  const current = appStore.get().habitLogs[habit.id]?.[date] || 0;
  if (habit.type === "bool") setHabitValue(habit.id, date, current ? 0 : 1);
  else setHabitValue(habit.id, date, current >= habit.target ? 0 : habit.target);
}

export function setRoutineStep(stepId: string, date: string, done: boolean, habitId: string | null) {
  update((s) => {
    const day = { ...(s.routineLogs[date] || {}) };
    if (done) day[stepId] = true;
    else delete day[stepId];
    return { ...s, routineLogs: { ...s.routineLogs, [date]: day } };
  });
  if (habitId) {
    const habit = appStore.get().habits.find((h) => h.id === habitId);
    if (habit) setHabitValue(habit.id, date, done ? (habit.type === "bool" ? 1 : habit.target) : 0);
  }
}

export function deleteHabit(id: string) {
  update((s) => {
    const logs = { ...s.habitLogs };
    delete logs[id];
    return {
      ...s,
      habits: s.habits.filter((h) => h.id !== id),
      habitLogs: logs,
      routines: s.routines.map((r) => ({
        ...r,
        steps: r.steps.map((st) => (st.habitId === id ? { ...st, habitId: null } : st)),
      })),
    };
  });
}

/* ---------------- Finanças ---------------- */

export function createTransaction(partial: Partial<Transaction>): Transaction {
  const t: Transaction = {
    id: uid(),
    kind: "saida",
    amount: 0,
    date: today(),
    description: "",
    categoryId: null,
    account: "",
    billId: null,
    goalId: null,
    ...partial,
  };
  insert("transactions", t);
  return t;
}

export function setBudgetLimit(month: string, categoryId: string, cents: number) {
  update((s) => {
    const b = s.budgets[month] || { income: null, limits: {} };
    return { ...s, budgets: { ...s.budgets, [month]: { ...b, limits: { ...b.limits, [categoryId]: cents } } } };
  });
}

export function setBudgetIncome(month: string, cents: number | null) {
  update((s) => {
    const b = s.budgets[month] || { income: null, limits: {} };
    return { ...s, budgets: { ...s.budgets, [month]: { ...b, income: cents } } };
  });
}

export function deleteCategory(id: string) {
  update((s) => ({
    ...s,
    categories: s.categories.filter((c) => c.id !== id),
    transactions: s.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)),
    bills: s.bills.map((b) => (b.categoryId === id ? { ...b, categoryId: null } : b)),
  }));
}

export function deleteProject(id: string) {
  update((s) => ({
    ...s,
    projects: s.projects.filter((p) => p.id !== id),
    tasks: s.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
  }));
}

export function deleteVideo(id: string) {
  update((s) => ({
    ...s,
    videos: s.videos.filter((v) => v.id !== id),
    tasks: s.tasks.map((t) => (t.videoId === id ? { ...t, videoId: null } : t)),
    favorites: s.favorites.filter((f) => !(f.kind === "video" && f.id === id)),
  }));
}

export function deleteNote(id: string) {
  update((s) => ({
    ...s,
    notes: s.notes.filter((n) => n.id !== id),
    favorites: s.favorites.filter((f) => !(f.kind === "note" && f.id === id)),
  }));
}

export function resetToSeed() {
  appStore.set(createSeed());
}

export function clearAll() {
  appStore.set(emptyState());
}

/* ---------- Quadro de criativos ---------- */

export function setBoard(fn: (b: AppState["creativeBoard"]) => AppState["creativeBoard"]) {
  update((s) => ({ ...s, creativeBoard: fn(s.creativeBoard) }));
}

/** Move um cartão para outra lista (e posição), mantendo a etapa coerente com listas de "concluído". */
export function moveCreative(id: string, columnId: string, beforeId: string | null) {
  update((s) => {
    const card = s.creatives.find((c) => c.id === id);
    const target = s.creativeBoard.columns.find((c) => c.id === columnId);
    if (!card || !target) return s;
    const others = s.creatives
      .filter((c) => c.columnId === columnId && c.id !== id)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
    const at = beforeId ? others.findIndex((c) => c.id === beforeId) : -1;
    const list = [...others];
    list.splice(at < 0 ? list.length : at, 0, card);
    const orders = new Map(list.map((c, i) => [c.id, (i + 1) * 1000]));
    let stage = card.stage;
    if (target.done) stage = "entregue";
    else if (card.stage === "entregue") stage = "criacao";
    return {
      ...s,
      creatives: s.creatives.map((c) => {
        if (c.id === id) return { ...c, columnId, stage, order: orders.get(c.id)!, updatedAt: Date.now() };
        return orders.has(c.id) ? { ...c, order: orders.get(c.id)! } : c;
      }),
    };
  });
}

/** Remove uma lista; os cartões dela vão para a lista indicada. */
export function deleteBoardColumn(columnId: string, moveTo: string | null) {
  update((s) => ({
    ...s,
    creativeBoard: { ...s.creativeBoard, columns: s.creativeBoard.columns.filter((c) => c.id !== columnId) },
    creatives: moveTo
      ? s.creatives.map((c) => (c.columnId === columnId ? { ...c, columnId: moveTo } : c))
      : s.creatives.filter((c) => c.columnId !== columnId),
  }));
}

export function deleteBoardLabel(labelId: string) {
  update((s) => ({
    ...s,
    creativeBoard: { ...s.creativeBoard, labels: s.creativeBoard.labels.filter((l) => l.id !== labelId) },
    creatives: s.creatives.map((c) => (c.labelIds.includes(labelId) ? { ...c, labelIds: c.labelIds.filter((x) => x !== labelId) } : c)),
  }));
}
