import { addDays, fromISO, today, toISO, weekday } from "./dates";
import type { Category, ISODate } from "./types";
import { normalize, parseMoney } from "./util";

export type CaptureKind = "task" | "ideia" | "video" | "criativo" | "nota" | "tx";

export const CAPTURE_KINDS: { kind: CaptureKind; label: string }[] = [
  { kind: "task", label: "Tarefa" },
  { kind: "ideia", label: "Ideia" },
  { kind: "video", label: "Ideia de vídeo" },
  { kind: "criativo", label: "Ideia de criativo" },
  { kind: "nota", label: "Nota" },
  { kind: "tx", label: "Lançamento" },
];

export interface CaptureGuess {
  kind: CaptureKind;
  title: string;
  date: ISODate | null;
  amount: number | null;
  txKind: "entrada" | "saida";
  categoryName: string | null;
}

const WEEKDAY_WORDS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const CATEGORY_HINTS: [RegExp, string][] = [
  [/almoc|jantar|lanche|ifood|restaurante|cafe|padaria|pizza/, "Alimentação"],
  [/mercado|supermercado|feira|hortifruti/, "Mercado"],
  [/uber|99|gasolina|combustivel|onibus|metro|estacionamento/, "Transporte"],
  [/netflix|spotify|youtube premium|assinatura|icloud|prime/, "Assinaturas"],
  [/cinema|show|bar|viagem|passeio|jogo/, "Lazer"],
  [/farmacia|medico|consulta|exame|academia|dentista/, "Saúde"],
  [/aluguel|condominio|luz|agua|internet|gas/, "Moradia"],
  [/camera|microfone|lente|cartao sd|tripe|iluminacao/, "Equipamento de vídeo"],
  [/salario|pagamento|recebi|freela|cliente/, "Receita"],
];

/** Lê o texto livre e sugere destino, data e valor. */
export function guessCapture(text: string): CaptureGuess {
  let title = text.trim();
  const n = normalize(title);
  let date: ISODate | null = null;
  let amount: number | null = null;

  // valor: "R$ 32,50", "32,50", "gastei 40"
  const moneyMatch = title.match(/r\$\s?(\d[\d.]*(?:,\d{1,2})?)|\b(\d[\d.]*,\d{2})\b/i);
  const spendWord = /\b(gastei|paguei|comprei|recebi)\b/.test(n);
  if (moneyMatch) {
    amount = parseMoney(moneyMatch[1] || moneyMatch[2]);
    title = title.replace(moneyMatch[0], "").trim();
  } else if (spendWord) {
    const m = title.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);
    if (m) {
      amount = parseMoney(m[1]);
      title = title.replace(m[0], "").trim();
    }
  }

  // data: hoje, amanhã, dia da semana, dd/mm
  const t0 = today();
  const dateRules: [RegExp, () => ISODate][] = [
    [/\bdepois de amanha\b/, () => addDays(t0, 2)],
    [/\bamanha\b/, () => addDays(t0, 1)],
    [/\bhoje\b/, () => t0],
  ];
  for (const [re, fn] of dateRules) {
    if (re.test(normalize(title))) {
      date = fn();
      title = stripWord(title, re);
      break;
    }
  }
  if (!date) {
    const wd = normalize(title).match(/\b(?:na |no |ate )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/);
    if (wd) {
      const target = WEEKDAY_WORDS[wd[1]];
      let diff = (target - weekday(t0) + 7) % 7;
      if (diff === 0) diff = 7;
      date = addDays(t0, diff);
      title = stripWord(title, new RegExp(wd[0].replace(/[-]/g, "\\-")));
    }
  }
  if (!date) {
    const dm = title.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (dm) {
      const now = fromISO(t0);
      let candidate = new Date(now.getFullYear(), Number(dm[2]) - 1, Number(dm[1]));
      if (toISO(candidate) < t0) candidate = new Date(now.getFullYear() + 1, Number(dm[2]) - 1, Number(dm[1]));
      date = toISO(candidate);
      title = title.replace(dm[0], "").trim();
    }
  }

  title = title.replace(/\s{2,}/g, " ").replace(/^[\s,.:-]+|[\s,.:-]+$/g, "");
  const nt = normalize(title);

  let kind: CaptureKind = "ideia";
  let txKind: "entrada" | "saida" = "saida";
  let categoryName: string | null = null;
  if (amount !== null) {
    kind = "tx";
    if (/\b(recebi|salario|pagamento de|freela)\b/.test(n)) txKind = "entrada";
    title = title.replace(/^(gastei|paguei|comprei|recebi)\s+(com\s+|no\s+|na\s+|de\s+)?/i, "");
    const hint = CATEGORY_HINTS.find(([re]) => re.test(normalize(title)));
    categoryName = hint ? hint[1] : null;
    if (txKind === "entrada") categoryName = "Receita";
  } else if (/^v[ií]deo\b|\bideia de v[ií]deo\b|\bgravar v[ií]deo sobre\b/i.test(title)) {
    kind = "video";
  } else if (/^(criativo|arte|carrossel|banner|story|post)\b|\bideia de (criativo|arte|post)\b/.test(nt)) {
    kind = "criativo";
  } else if (date) {
    kind = "task";
  } else if (/^(ligar|comprar|pagar|enviar|mandar|marcar|agendar|responder|fazer|terminar|renovar|levar|buscar|resolver)\b/.test(nt)) {
    kind = "task";
  } else if (/^(nota|anotacao|resumo)\b/.test(nt)) {
    kind = "nota";
  }

  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { kind, title, date, amount, txKind, categoryName };
}

function stripWord(text: string, re: RegExp): string {
  // remove a ocorrência ignorando acentos, preservando o resto do texto original
  const norm = normalize(text);
  const m = norm.match(new RegExp(`(?:\\b(?:para |pra |ate )?)${re.source.replace(/\\b/g, "")}`));
  if (!m || m.index === undefined) return text;
  return (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
}

export function findCategory(categories: Category[], name: string | null): Category | undefined {
  if (!name) return undefined;
  return categories.find((c) => normalize(c.name) === normalize(name));
}
