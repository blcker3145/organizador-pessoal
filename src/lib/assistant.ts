/* Assistente de IA que conversa e executa pequenas ações no app. */
import { chat, markdownToBlocks, type ChatMessage, type ToolDef } from "./ai";
import { formatRange, hm, isAllDayLike, LOCAL_CALENDAR_ID, parseLocal, type UiEvent } from "./calendar";
import { defaultCalendarId, eventsInRange, newDraft, saveDraft } from "./calendarActions";
import { CREATIVE_FORMATS, creativeStageInfo } from "./creatives";
import { addDays, longDate, relativeDate, today, weekday, WEEKDAYS_LONG } from "./dates";
import { monthSummary } from "./finance";
import { gcalStore, refreshGcalStatus } from "./gcal";
import {
  appStore,
  createCreative,
  createNote,
  createTask,
  createTransaction,
  createVideo,
  ensureProject,
  setTaskStatus,
  templateBlocks,
} from "./store";
import type { NoteKind, Priority, RepeatRule } from "./types";
import { normalize, parseMoney, uid } from "./util";

/** Remove campos undefined para não apagar os valores padrão ao criar itens. */
function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export interface CreatedItem {
  kind: "task" | "video" | "creative" | "note" | "transaction" | "done" | "event";
  id: string;
  label: string;
  path?: string;
}

const PLATFORMS = ["YouTube", "Shorts", "Reels", "TikTok", "Instagram"];

export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description: "Cria uma tarefa no módulo Tarefas.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          data: { type: "string", description: "Data no formato AAAA-MM-DD, se houver" },
          prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
          projeto: { type: "string", description: "Nome do projeto (ex.: Trabalho, Pessoal, Vídeos, Design)" },
          notas: { type: "string", description: "Detalhes da tarefa em markdown simples" },
          subtarefas: { type: "array", items: { type: "string" } },
        },
        required: ["titulo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_video",
      description: "Cria um vídeo no pipeline de Vídeos, opcionalmente já com roteiro.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          formato: { type: "string", enum: ["longo", "curto"] },
          plataformas: { type: "array", items: { type: "string", enum: PLATFORMS } },
          data_publicacao: { type: "string", description: "AAAA-MM-DD" },
          etapa: { type: "string", enum: ["ideia", "roteiro", "gravacao", "edicao", "agendado"] },
          roteiro: { type: "string", description: "Roteiro em markdown com seções ## Gancho, ## Contexto, ## Desenvolvimento, ## Chamada para ação" },
          legenda: { type: "string" },
        },
        required: ["titulo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_criativo",
      description: "Cria uma peça de design no módulo Criativos.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          formato: { type: "string", enum: CREATIVE_FORMATS.map((f) => f.value) },
          cliente: { type: "string" },
          data_entrega: { type: "string", description: "AAAA-MM-DD" },
          etapa: { type: "string", enum: ["ideia", "briefing", "criacao", "revisao", "aprovado"] },
          headline: { type: "string" },
          texto_apoio: { type: "string" },
          cta: { type: "string" },
          slides: { type: "array", items: { type: "string" }, description: "Texto de cada slide, para carrossel" },
          briefing: { type: "string", description: "Briefing em markdown, do jeito que fizer sentido para a peça (texto corrido, listas ou títulos). Sem modelo fixo." },
        },
        required: ["titulo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_nota",
      description: "Salva uma ideia ou nota em Ideias & Notas.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          tipo: { type: "string", enum: ["ideia", "nota", "video", "criativo"], description: "video = ideia de vídeo; criativo = ideia de criativo" },
          conteudo: { type: "string", description: "Texto em markdown simples" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["titulo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_lancamento",
      description: "Registra um gasto (saída) ou uma entrada de dinheiro em Finanças.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["saida", "entrada"] },
          valor: { type: "number", description: "Valor em reais, ex.: 32.5" },
          descricao: { type: "string" },
          categoria: { type: "string", description: "Nome de uma categoria existente" },
          data: { type: "string", description: "AAAA-MM-DD; padrão hoje" },
          conta: { type: "string" },
        },
        required: ["tipo", "valor", "descricao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_evento",
      description: "Cria um compromisso na Agenda (vai para o Google Agenda quando ele está conectado). Use para reuniões, consultas, gravações com horário marcado e lembretes com hora.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          data: { type: "string", description: "Data no formato AAAA-MM-DD" },
          hora_inicio: { type: "string", description: "HH:MM (24h). Omitir para evento de dia inteiro." },
          hora_fim: { type: "string", description: "HH:MM (24h). Se omitido, usa duracao_minutos ou 1 hora." },
          duracao_minutos: { type: "number" },
          data_fim: { type: "string", description: "AAAA-MM-DD, para eventos de vários dias" },
          local: { type: "string" },
          descricao: { type: "string" },
          convidados: { type: "array", items: { type: "string" }, description: "E-mails dos convidados" },
          google_meet: { type: "boolean", description: "Adicionar link do Google Meet" },
          repetir: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly", "yearly"] },
          lembrete_minutos: { type: "number", description: "Minutos antes para lembrar" },
        },
        required: ["titulo", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ver_agenda",
      description: "Lista os compromissos da Agenda (Google Agenda e Organizador) a partir de uma data.",
      parameters: {
        type: "object",
        properties: {
          data_inicio: { type: "string", description: "AAAA-MM-DD; padrão hoje" },
          dias: { type: "number", description: "Quantidade de dias (1 a 31); padrão 1" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "concluir_tarefa",
      description: "Marca como feita a tarefa aberta cujo título mais combina com o texto informado.",
      parameters: { type: "object", properties: { titulo: { type: "string" } }, required: ["titulo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "ver_resumo",
      description: "Lê o estado atual: tarefas atrasadas e dos próximos dias, vídeos e criativos em andamento, hábitos e dinheiro do mês. Use antes de responder perguntas sobre o que a pessoa tem para fazer.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const validDate = (d: unknown): string | null => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function findProject(name: string): string | null {
  if (!name) return null;
  return ensureProject(name);
}

const validTime = (t: unknown): string | null => (typeof t === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(t.trim()) ? t.trim().padStart(5, "0") : null);

function eventLine(ev: UiEvent, withDate: boolean): string {
  const when = withDate ? formatRange(ev) : isAllDayLike(ev) ? "dia inteiro" : `${hm(ev.start)}–${hm(ev.end)}`;
  return `- ${when}: ${ev.title}${ev.location ? ` (${ev.location})` : ""}`;
}

async function agendaText(from: Date, days: number): Promise<string> {
  await refreshGcalStatus();
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const list = await eventsInRange(from, to);
  const source = gcalStore.get().connected ? "Google Agenda + Organizador" : "Organizador (Google Agenda não conectado)";
  if (!list.length) return `Nenhum compromisso (${source}).`;
  return `Fonte: ${source}\n${list.map((e) => eventLine(e, days > 1)).join("\n")}`;
}

async function createEventTool(a: Record<string, unknown>): Promise<{ result: string; item?: CreatedItem }> {
  const date = validDate(a.data);
  if (!date) return { result: "Erro: informe a data no formato AAAA-MM-DD." };
  await refreshGcalStatus();
  const startTime = validTime(a.hora_inicio);
  const allDay = !startTime;
  const start = parseLocal(allDay ? date : `${date}T${startTime}`);
  const endTime = validTime(a.hora_fim);
  const endDate = validDate(a.data_fim) || date;
  let end: Date;
  if (allDay) end = new Date(parseLocal(endDate < date ? date : endDate).getTime() + 86_400_000);
  else if (endTime) end = parseLocal(`${endDate}T${endTime}`);
  else end = new Date(start.getTime() + (typeof a.duracao_minutos === "number" && a.duracao_minutos > 0 ? a.duracao_minutos : 60) * 60_000);
  if (!allDay && end <= start) end = new Date(start.getTime() + 60 * 60_000);

  const calendarId = defaultCalendarId();
  const d = newDraft(start, end, allDay, calendarId);
  d.title = str(a.titulo) || "Sem título";
  d.location = str(a.local);
  d.description = str(a.descricao);
  const guests = strList(a.convidados).filter((g) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g));
  const google = calendarId !== LOCAL_CALENDAR_ID;
  if (google) {
    d.guests = guests;
    d.addMeet = a.google_meet === true;
  }
  const repeat = str(a.repetir) as RepeatRule;
  if (["daily", "weekdays", "weekly", "monthly", "yearly"].includes(repeat)) d.repeat = repeat;
  if (typeof a.lembrete_minutos === "number" && a.lembrete_minutos >= 0) {
    d.useDefaultReminders = false;
    d.reminders = [Math.round(a.lembrete_minutos)];
  }
  try {
    await saveDraft(d);
  } catch (e) {
    return { result: `Erro ao criar o evento: ${e instanceof Error ? e.message : "falha desconhecida"}` };
  }
  const where = google ? "no Google Agenda" : "na agenda do Organizador (Google Agenda não conectado)";
  const skipped = !google && (guests.length || a.google_meet === true) ? " Convidados e Meet só funcionam com o Google Agenda conectado." : "";
  const when = allDay ? date : `${date} ${hm(start)}–${hm(end)}`;
  return {
    result: `Evento criado ${where}: "${d.title}" em ${when}.${skipped}`,
    item: { kind: "event", id: uid(), label: `${d.title} · ${relativeDate(date)}${allDay ? "" : ` ${hm(start)}`}`, path: "/agenda" },
  };
}

function overview(): string {
  const s = appStore.get();
  const d0 = today();
  const week = addDays(d0, 7);
  const open = s.tasks.filter((t) => t.status !== "done");
  const line = (title: string, date: string | null) => `- ${title || "Sem título"}${date ? ` (${relativeDate(date)}, ${date})` : ""}`;
  const sum = monthSummary(s, d0.slice(0, 7));
  const parts = [
    `Hoje é ${longDate(d0)} (${d0}).`,
    `Tarefas atrasadas:\n${open.filter((t) => t.date && t.date < d0).map((t) => line(t.title, t.date)).join("\n") || "- nenhuma"}`,
    `Tarefas de hoje:\n${open.filter((t) => t.date === d0).map((t) => line(t.title, null)).join("\n") || "- nenhuma"}`,
    `Próximos 7 dias:\n${open.filter((t) => t.date && t.date > d0 && t.date <= week).map((t) => line(t.title, t.date)).join("\n") || "- nada"}`,
    `Sem data: ${open.filter((t) => !t.date).length} tarefa(s).`,
    `Vídeos em andamento:\n${s.videos.filter((v) => v.stage !== "publicado").map((v) => `- ${v.title} [${v.stage}]${v.publishDate ? ` publica ${v.publishDate}` : ""}`).join("\n") || "- nenhum"}`,
    `Criativos em andamento:\n${s.creatives.filter((c) => c.stage !== "entregue").map((c) => `- ${c.title} [${creativeStageInfo(c.stage).label}]${c.dueDate ? ` entrega ${c.dueDate}` : ""}${c.client ? ` · ${c.client}` : ""}`).join("\n") || "- nenhum"}`,
    `Dinheiro do mês: entradas R$ ${(sum.income / 100).toFixed(2)}, saídas R$ ${(sum.expenses / 100).toFixed(2)}, orçamento usado ${sum.budgetUsedPct}%.`,
    `Hábitos ativos: ${s.habits.filter((h) => !h.archived).map((h) => h.name).join(", ") || "nenhum"}.`,
  ];
  return parts.join("\n\n");
}

/** Executa uma ferramenta pedida pela IA e devolve texto para ela + item criado para a interface. */
export async function runTool(name: string, rawArgs: string): Promise<{ result: string; item?: CreatedItem }> {
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(rawArgs || "{}");
  } catch {
    return { result: "Erro: argumentos inválidos." };
  }
  const s = appStore.get();

  switch (name) {
    case "criar_tarefa": {
      const t = createTask(compact({
        title: str(a.titulo) || "Sem título",
        date: validDate(a.data),
        priority: (["alta", "media", "baixa"].includes(str(a.prioridade)) ? str(a.prioridade) : null) as Priority | null,
        projectId: findProject(str(a.projeto)),
        body: str(a.notas) ? markdownToBlocks(str(a.notas)) : undefined,
        subtasks: strList(a.subtarefas).map((title) => ({ id: uid(), title, done: false })),
      }));
      return { result: `Tarefa criada: "${t.title}"${t.date ? ` para ${t.date}` : ""}.`, item: { kind: "task", id: t.id, label: t.title } };
    }
    case "criar_video": {
      const roteiro = str(a.roteiro);
      const v = createVideo(compact({
        title: str(a.titulo) || "Sem título",
        format: a.formato === "curto" ? "curto" : "longo",
        platforms: strList(a.plataformas).filter((p) => PLATFORMS.includes(p)).length ? strList(a.plataformas).filter((p) => PLATFORMS.includes(p)) : ["YouTube"],
        publishDate: validDate(a.data_publicacao),
        stage: (["ideia", "roteiro", "gravacao", "edicao", "agendado"].includes(str(a.etapa)) ? str(a.etapa) : roteiro ? "roteiro" : "ideia") as "ideia",
        script: roteiro ? markdownToBlocks(roteiro) : s.scriptTemplates[0] ? templateBlocks(s.scriptTemplates[0].sections) : undefined,
        caption: str(a.legenda),
      }));
      return { result: `Vídeo criado: "${v.title}".`, item: { kind: "video", id: v.id, label: v.title, path: `/videos/${v.id}` } };
    }
    case "criar_criativo": {
      const format = CREATIVE_FORMATS.find((f) => f.value === str(a.formato)) || CREATIVE_FORMATS[0];
      const slides = strList(a.slides);
      const c = createCreative({
        title: str(a.titulo) || "Sem título",
        format: format.value,
        size: format.size,
        client: str(a.cliente),
        dueDate: validDate(a.data_entrega),
        stage: (["ideia", "briefing", "criacao", "revisao", "aprovado"].includes(str(a.etapa)) ? str(a.etapa) : "ideia") as "ideia",
        headline: str(a.headline),
        bodyText: str(a.texto_apoio),
        cta: str(a.cta),
        slides: slides.map((text) => ({ id: uid(), text })),
        briefing: str(a.briefing) ? markdownToBlocks(str(a.briefing)) : undefined,
      });
      return { result: `Criativo criado: "${c.title}" (${c.format}).`, item: { kind: "creative", id: c.id, label: c.title, path: `/criativos/${c.id}` } };
    }
    case "criar_nota": {
      const kind = (["ideia", "nota", "video", "criativo"].includes(str(a.tipo)) ? str(a.tipo) : "ideia") as NoteKind;
      const n = createNote(compact({
        title: str(a.titulo) || "Sem título",
        kind,
        tags: strList(a.tags),
        body: str(a.conteudo) ? markdownToBlocks(str(a.conteudo)) : undefined,
      }));
      return { result: `Nota criada: "${n.title}".`, item: { kind: "note", id: n.id, label: n.title, path: `/ideias/${n.id}` } };
    }
    case "registrar_lancamento": {
      const kind = a.tipo === "entrada" ? "entrada" : "saida";
      const cents = typeof a.valor === "number" ? Math.round(a.valor * 100) : parseMoney(String(a.valor ?? ""));
      if (!cents || cents <= 0) return { result: "Erro: valor inválido." };
      const cat = s.categories.find((c) => c.kind === kind && normalize(c.name) === normalize(str(a.categoria)));
      const tx = createTransaction({ kind, amount: cents, description: str(a.descricao) || "Lançamento", categoryId: cat?.id || null, date: validDate(a.data) || today(), account: str(a.conta) });
      return {
        result: `Lançamento registrado: ${kind} de R$ ${(cents / 100).toFixed(2)} (${tx.description})${cat ? ` em ${cat.name}` : " sem categoria"}.`,
        item: { kind: "transaction", id: tx.id, label: `${tx.description} · R$ ${(cents / 100).toFixed(2).replace(".", ",")}`, path: "/financas/lancamentos" },
      };
    }
    case "concluir_tarefa": {
      const q = normalize(str(a.titulo));
      const open = s.tasks.filter((t) => t.status !== "done");
      const match = open.find((t) => normalize(t.title) === q) || open.find((t) => normalize(t.title).includes(q)) || open.find((t) => q.includes(normalize(t.title)) && t.title);
      if (!match) return { result: `Nenhuma tarefa aberta encontrada com "${str(a.titulo)}".` };
      setTaskStatus(match.id, "done");
      return { result: `Tarefa concluída: "${match.title}".`, item: { kind: "done", id: match.id, label: match.title } };
    }
    case "criar_evento":
      return createEventTool(a);
    case "ver_agenda": {
      const from = parseLocal(validDate(a.data_inicio) || today());
      const days = Math.max(1, Math.min(31, typeof a.dias === "number" ? Math.round(a.dias) : 1));
      return { result: await agendaText(from, days) };
    }
    case "ver_resumo":
      return { result: `${overview()}\n\nAgenda de hoje:\n${await agendaText(parseLocal(today()), 1)}` };
    default:
      return { result: `Ferramenta desconhecida: ${name}` };
  }
}

function systemPrompt(): string {
  const s = appStore.get();
  const d0 = today();
  const nextDays = Array.from({ length: 7 }, (_, i) => addDays(d0, i + 1))
    .map((d) => `${WEEKDAYS_LONG[weekday(d)]} = ${d}`)
    .join("; ");
  return `Você é o assistente do Organizador, um app pessoal de organização de um criador de conteúdo e designer brasileiro.
Fale em português do Brasil, de forma curta e direta.
Hoje é ${longDate(d0)} (${d0}). Próximos dias: ${nextDays}.
Projetos existentes: ${s.projects.map((p) => p.name).join(", ") || "nenhum"}.
Categorias de saída: ${s.categories.filter((c) => c.kind === "saida").map((c) => c.name).join(", ") || "nenhuma"}. Categorias de entrada: ${s.categories.filter((c) => c.kind === "entrada").map((c) => c.name).join(", ") || "nenhuma"}.
Quando a pessoa pedir para adicionar, criar, anotar, registrar ou concluir algo, use as ferramentas em vez de só responder. Converta datas relativas ("amanhã", "sexta") para AAAA-MM-DD.
Se pedirem para criar um vídeo ou criativo com conteúdo (roteiro, copy, slides, briefing), escreva esse conteúdo completo nos campos da ferramenta.
Compromissos com data e hora (reuniões, consultas, chamadas) vão para a Agenda com criar_evento; afazeres sem horário fixo são tarefas.
Para perguntas sobre o que há para fazer, chame ver_resumo antes de responder. Para a agenda de outros dias, use ver_agenda.
Depois de agir, confirme em uma ou duas frases o que foi feito. Não invente itens que não foram criados.`;
}

/** Roda uma rodada de conversa, executando ferramentas até a IA dar a resposta final. */
export async function runAssistant(history: ChatMessage[]): Promise<{ messages: ChatMessage[]; items: CreatedItem[] }> {
  const convo: ChatMessage[] = [{ role: "system", content: systemPrompt() }, ...history];
  const items: CreatedItem[] = [];
  for (let step = 0; step < 6; step++) {
    const { content, toolCalls } = await chat(convo, ASSISTANT_TOOLS);
    if (!toolCalls.length) {
      convo.push({ role: "assistant", content });
      break;
    }
    convo.push({ role: "assistant", content: content || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const { result, item } = await runTool(call.function.name, call.function.arguments);
      if (item) items.push(item);
      convo.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return { messages: convo.slice(1), items };
}
