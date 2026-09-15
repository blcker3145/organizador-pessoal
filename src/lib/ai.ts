/*
 * IA pelo servidor: o app chama a função de IA do Supabase com o login da pessoa,
 * e só o servidor conhece a chave do provedor (Google Gemini ou OpenAI).
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createStore } from "./createStore";
import { supabase } from "./supabase";
import type { Block, BlockType } from "./types";
import { textBlock } from "./util";

export class AiError extends Error {}

export interface AiUsage {
  used: number;
  limit: number;
}

/** Uso de hoje, atualizado a cada resposta do servidor. */
export const aiUsageStore = createStore<AiUsage | null>(null);
export const useAiUsage = aiUsageStore.use;

export type AiProvider = "gemini" | "openai";

/** Provedor em uso no servidor, informado nas respostas. */
export const aiProviderStore = createStore<AiProvider | null>(null);
export const useAiProvider = aiProviderStore.use;

export function providerLabel(provider: AiProvider | null): string {
  if (provider === "gemini") return "Google Gemini";
  if (provider === "openai") return "ChatGPT";
  return "IA";
}

/** Endereço (slug) da função no Supabase; o padrão é "ai". */
const AI_FUNCTION = (import.meta.env.VITE_SUPABASE_AI_FUNCTION as string | undefined)?.trim() || "ai";

async function callAi<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new AiError("O servidor ainda não foi configurado.");
  const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body });
  if (error) {
    let message = "";
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        if (payload?.usage) aiUsageStore.set(payload.usage);
        if (payload?.provider) aiProviderStore.set(payload.provider);
        message = payload?.error || "";
        if (!message && error.context.status === 404) message = `A função "${AI_FUNCTION}" ainda não foi publicada no Supabase.`;
      } catch {
        /* resposta sem JSON */
      }
    }
    if (!message) {
      message = /failed to send|fetch/i.test(error.message)
        ? 'Não foi possível falar com o servidor de IA. Confira sua internet e se a função de IA foi publicada no Supabase.'
        : error.message;
    }
    throw new AiError(message);
  }
  if (data?.usage) aiUsageStore.set(data.usage);
  if (data?.provider) aiProviderStore.set(data.provider);
  return data as T;
}

export async function refreshAiUsage() {
  try {
    await callAi<{ usage: AiUsage }>({ action: "usage" });
  } catch {
    /* sem uso para mostrar */
  }
}

/* ---------------- Chat Completions ---------------- */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export async function chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const data = await callAi<{ message?: { content: string | null; tool_calls?: ToolCall[] } }>({
    messages,
    ...(tools && tools.length ? { tools } : {}),
  });
  return { content: data.message?.content || "", toolCalls: data.message?.tool_calls || [] };
}

/* ---------------- Texto <-> blocos ---------------- */

export function blocksToMarkdown(blocks: Block[]): string {
  let n = 0;
  return blocks
    .map((b) => {
      n = b.type === "number" ? n + 1 : 0;
      switch (b.type) {
        case "h1":
          return `# ${b.text}`;
        case "h2":
          return `## ${b.text}`;
        case "h3":
          return `### ${b.text}`;
        case "bullet":
          return `- ${b.text}`;
        case "number":
          return `${n}. ${b.text}`;
        case "todo":
          return `[${b.checked ? "x" : " "}] ${b.text}`;
        case "quote":
          return `> ${b.text}`;
        case "divider":
          return "---";
        default:
          return b.text;
      }
    })
    .join("\n")
    .trim();
}

export function markdownToBlocks(md: string): Block[] {
  const rules: [RegExp, BlockType][] = [
    [/^###\s+/, "h3"],
    [/^##\s+/, "h2"],
    [/^#\s+/, "h1"],
    [/^[-*•]\s+/, "bullet"],
    [/^\d+[.)]\s+/, "number"],
    [/^>\s?/, "quote"],
  ];
  const blocks: Block[] = [];
  md.replace(/\r/g, "")
    .replace(/^```[a-z]*\n?|```$/gm, "")
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.trimEnd();
      if (!line.trim()) return;
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        blocks.push({ ...textBlock(), type: "divider" });
        return;
      }
      const todo = line.match(/^(?:[-*]\s+)?\[( |x|X)\]\s+(.*)$/);
      if (todo) {
        blocks.push({ ...textBlock(todo[2], "todo"), checked: todo[1].toLowerCase() === "x" });
        return;
      }
      for (const [re, type] of rules) {
        if (re.test(line)) {
          blocks.push(textBlock(stripInline(line.replace(re, "")), type));
          return;
        }
      }
      blocks.push(textBlock(stripInline(line)));
    });
  return blocks.length ? blocks : [textBlock()];
}

/** Remove negrito/itálico em markdown, que o editor não mostra. */
function stripInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}

/* ---------------- Ações rápidas de escrita ---------------- */

export interface WritingAction {
  id: string;
  label: string;
  instruction: string;
}

export const WRITING_ACTIONS: WritingAction[] = [
  { id: "melhorar", label: "Melhorar texto", instruction: "Melhore a clareza, a fluidez e a escolha de palavras, mantendo a ideia e o tom." },
  { id: "copy", label: "Transformar em copy persuasiva", instruction: "Reescreva como copy persuasiva para redes sociais: gancho forte, benefício claro e chamada para ação." },
  { id: "roteiro", label: "Transformar em roteiro de vídeo", instruction: "Transforme em roteiro de vídeo com as seções Gancho, Contexto, Desenvolvimento e Chamada para ação, em linguagem falada." },
  { id: "curto", label: "Deixar mais curto", instruction: "Deixe o texto mais curto e direto, cortando repetições, sem perder o essencial." },
  { id: "longo", label: "Expandir e detalhar", instruction: "Expanda o texto com mais detalhes, exemplos e argumentos." },
  { id: "continuar", label: "Continuar escrevendo", instruction: "Continue o texto a partir de onde parou, no mesmo tom. Responda só com a continuação." },
  { id: "ideias", label: "Gerar ideias", instruction: "Gere uma lista de ideias relacionadas ao tema do texto, em tópicos curtos." },
  { id: "corrigir", label: "Corrigir ortografia e gramática", instruction: "Corrija ortografia, acentuação, pontuação e gramática sem mudar o estilo." },
  { id: "resumir", label: "Resumir", instruction: "Resuma em poucos tópicos o que importa." },
];

const WRITER_SYSTEM = `Você é um assistente de escrita dentro de um organizador pessoal de um criador de conteúdo e designer brasileiro.
Responda sempre em português do Brasil, só com o texto final, sem comentários antes ou depois, sem aspas envolvendo a resposta.
Formate com markdown simples quando fizer sentido: "## " para títulos de seção, "- " para listas, "1. " para listas numeradas, "[ ] " para checklist. Não use negrito.`;

/** Pede à IA para reescrever/gerar texto. history permite pedir ajustes sobre a última versão. */
export async function writeWithAi(opts: {
  text: string;
  instruction: string;
  context?: string;
  history?: { instruction: string; result: string }[];
  plain?: boolean;
}): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: WRITER_SYSTEM + (opts.plain ? "\nEste campo é de texto simples: não use markdown nem quebras de linha desnecessárias." : "") },
  ];
  const ctx = opts.context ? `Contexto: ${opts.context}\n\n` : "";
  const source = opts.text.trim() ? `Texto atual:\n"""\n${opts.text}\n"""` : "O campo está vazio: escreva do zero.";
  messages.push({ role: "user", content: `${ctx}${source}\n\nPedido: ${opts.history?.length ? opts.history[0].instruction : opts.instruction}` });
  (opts.history || []).forEach((h, i) => {
    messages.push({ role: "assistant", content: h.result });
    const nextInstruction = opts.history![i + 1]?.instruction ?? opts.instruction;
    if (i < opts.history!.length) messages.push({ role: "user", content: `Ajuste a última versão: ${nextInstruction}` });
  });
  const { content } = await chat(messages);
  return content.trim();
}
