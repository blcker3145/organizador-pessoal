export type ISODate = string; // "YYYY-MM-DD"

export type BlockType =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "number"
  | "todo"
  | "quote"
  | "divider";

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

/* ---------- Tarefas ---------- */
export type TaskStatus = "todo" | "doing" | "done";
export type Priority = "alta" | "media" | "baixa";
export type Repeat = "none" | "daily" | "weekly" | "monthly";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority | null;
  date: ISODate | null;
  projectId: string | null;
  videoId: string | null;
  creativeId: string | null;
  noteId: string | null;
  tags: string[];
  subtasks: Subtask[];
  body: Block[];
  repeat: Repeat;
  focusDate: ISODate | null;
  createdAt: number;
  completedAt: number | null;
}

export interface Project {
  id: string;
  name: string;
}

/* ---------- Ideias & Notas ---------- */
export type NoteKind = "ideia" | "nota" | "video" | "criativo";

export interface Note {
  id: string;
  title: string;
  kind: NoteKind;
  tags: string[];
  pinned: boolean;
  body: Block[];
  createdAt: number;
  updatedAt: number;
  converted: { kind: "task" | "video" | "creative"; id: string }[];
}

/* ---------- Vídeos ---------- */
export type VideoStage =
  | "ideia"
  | "roteiro"
  | "gravacao"
  | "edicao"
  | "agendado"
  | "publicado";

export type VideoFormat = "longo" | "curto";

export interface VideoRef {
  id: string;
  label: string;
  url: string;
}

export interface Video {
  id: string;
  title: string;
  stage: VideoStage;
  platforms: string[];
  format: VideoFormat;
  publishDate: ISODate | null;
  publishTime: string;
  script: Block[];
  references: VideoRef[];
  caption: string;
  publishedUrl: string;
  noteId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptTemplate {
  id: string;
  name: string;
  sections: string[];
}

/* ---------- Criativos (design) ---------- */
export type CreativeStage = "ideia" | "briefing" | "criacao" | "revisao" | "aprovado" | "entregue";

export interface CreativeImage {
  id: string;
  src: string; // data URL (upload) ou link
  caption: string;
}

export interface CreativeSlide {
  id: string;
  text: string;
}

export interface Creative {
  id: string;
  title: string;
  stage: CreativeStage;
  format: string;
  size: string;
  channels: string[];
  client: string;
  dueDate: ISODate | null;
  briefing: Block[];
  headline: string;
  bodyText: string;
  cta: string;
  slides: CreativeSlide[];
  palette: string[];
  fonts: string;
  moodboard: CreativeImage[];
  references: VideoRef[];
  fileUrl: string;
  noteId: string | null;
  createdAt: number;
  updatedAt: number;
}

/* ---------- Hábitos ---------- */
export type HabitFreq =
  | { kind: "daily" }
  | { kind: "weekly"; times: number }
  | { kind: "days"; days: number[] }; // 0 = domingo

export interface Habit {
  id: string;
  name: string;
  type: "bool" | "qty";
  target: number;
  unit: string;
  freq: HabitFreq;
  archived: boolean;
  createdAt: number;
}

/* ---------- Rotina ---------- */
export interface RoutineStep {
  id: string;
  title: string;
  minutes: number;
  habitId: string | null;
}

export interface Routine {
  id: string;
  name: string;
  days: number[];
  start: string; // "HH:MM"
  steps: RoutineStep[];
}

/* ---------- Finanças ---------- */
export type TxKind = "entrada" | "saida";

export interface Category {
  id: string;
  name: string;
  kind: TxKind;
  limit: number; // centavos, limite mensal padrão
}

export interface Transaction {
  id: string;
  kind: TxKind;
  amount: number; // centavos
  date: ISODate;
  description: string;
  categoryId: string | null;
  account: string;
  billId: string | null;
  goalId: string | null;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  day: number;
  categoryId: string | null;
  active: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  initial: number;
  deadline: ISODate | null;
}

export interface MonthBudget {
  income: number | null;
  limits: Record<string, number>;
}

/* ---------- Estado ---------- */
export type FavoriteKind = "note" | "video" | "creative";

export interface AppState {
  version: number;
  profile: { name: string };
  settings: { theme: "system" | "light" | "dark" };
  tasks: Task[];
  projects: Project[];
  notes: Note[];
  videos: Video[];
  creatives: Creative[];
  scriptTemplates: ScriptTemplate[];
  habits: Habit[];
  habitLogs: Record<string, Record<ISODate, number>>;
  routines: Routine[];
  routineLogs: Record<ISODate, Record<string, boolean>>;
  categories: Category[];
  transactions: Transaction[];
  bills: Bill[];
  goals: Goal[];
  budgets: Record<string, MonthBudget>;
  favorites: { kind: FavoriteKind; id: string }[];
}
