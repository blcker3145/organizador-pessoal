// Função de IA do Supabase: recebe o pedido do app, confere o login e o limite
// diário da pessoa e chama o provedor de IA com a chave guardada nos segredos.
// A chave nunca chega ao navegador.
//
// Segredos (Edge Functions → Secrets). Use UM provedor:
//   GEMINI_API_KEY   chave do Google AI Studio (começa com AQ. ou AIza)  ← gratuito com limites
//   OPENAI_API_KEY   chave da OpenAI (começa com sk-)                    ← pago por uso
// Opcionais:
//   AI_PROVIDER      "gemini" ou "openai", para forçar um dos dois
//   AI_DAILY_LIMIT   pedidos por pessoa por dia (padrão 50)
//   GEMINI_MODEL     ex.: gemini-flash-latest (padrão: escolhe sozinho)
//   OPENAI_MODEL     ex.: gpt-4o-mini (padrão: escolhe sozinho)
//
// O app sempre conversa no formato de mensagens da OpenAI (messages/tools/tool_calls);
// para o Gemini a função converte na ida e na volta.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_CHARS = 120_000;

type Json = Record<string, unknown>;
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
interface ToolDef {
  type: "function";
  function: { name: string; description?: string; parameters?: Json };
}
interface AiReply {
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  model: string;
}

class ProviderError extends Error {
  constructor(message: string, public refund = true) {
    super(message);
  }
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/* ---------------- Escolha do provedor ---------------- */

const looksLikeGoogleKey = (key: string) => /^(AQ\.|AIza)/.test(key.trim());

function resolveProvider(): { provider: "gemini" | "openai"; key: string } | null {
  const gemini = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  const openai = (Deno.env.get("OPENAI_API_KEY") || "").trim();
  const forced = (Deno.env.get("AI_PROVIDER") || "").trim().toLowerCase();
  if (forced === "gemini" && (gemini || looksLikeGoogleKey(openai))) return { provider: "gemini", key: gemini || openai };
  if (forced === "openai" && openai) return { provider: "openai", key: openai };
  if (gemini) return { provider: "gemini", key: gemini };
  // chave do Google colocada por engano no segredo da OpenAI também funciona
  if (openai && looksLikeGoogleKey(openai)) return { provider: "gemini", key: openai };
  if (openai) return { provider: "openai", key: openai };
  return null;
}

/* ---------------- OpenAI ---------------- */

const OPENAI_PREFERRED = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini", "gpt-5", "gpt-4.1", "gpt-4o"];
let openaiModel = Deno.env.get("OPENAI_MODEL") || "";

async function pickOpenAiModel(key: string): Promise<string> {
  if (openaiModel) return openaiModel;
  try {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const ids: string[] = (await res.json()).data.map((m: { id: string }) => m.id);
      openaiModel = OPENAI_PREFERRED.find((m) => ids.includes(m)) || ids.find((id) => /^gpt-.*mini/.test(id)) || "gpt-4o-mini";
      return openaiModel;
    }
  } catch {
    /* usa o padrão */
  }
  return "gpt-4o-mini";
}

async function callOpenAi(key: string, messages: ChatMessage[], tools: ToolDef[] | undefined, userId: string): Promise<AiReply> {
  const model = await pickOpenAiModel(key);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, ...(tools?.length ? { tools } : {}), user: userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail: string = data?.error?.message || "";
    if (/model/i.test(detail)) openaiModel = Deno.env.get("OPENAI_MODEL") || "";
    if (res.status === 401) throw new ProviderError("A chave da OpenAI configurada no servidor é inválida. Troque o segredo OPENAI_API_KEY no Supabase.");
    if (res.status === 429 && /quota|billing/i.test(detail)) throw new ProviderError("A conta da OpenAI está sem créditos. Adicione saldo em platform.openai.com → Billing.");
    if (res.status === 429) throw new ProviderError("Muitos pedidos seguidos para a OpenAI. Espere alguns segundos e tente de novo.");
    throw new ProviderError(detail || `A OpenAI respondeu com erro ${res.status}.`);
  }
  const msg = data.choices?.[0]?.message || {};
  return { message: { role: "assistant", content: msg.content ?? "", ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) }, model };
}

/* ---------------- Google Gemini (API nativa) ---------------- */

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
// Escrita comum vai no modelo mais rápido; quando há ferramentas (assistente), começa no flash completo.
const GEMINI_FAST = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.0-flash-lite"];
const GEMINI_PREFERRED = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
/** Tempo máximo esperando um modelo antes de tentar o próximo. */
const ATTEMPT_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
let geminiModel = Deno.env.get("GEMINI_MODEL") || "";
/** Modelos de reserva, na ordem de tentativa, para quando o principal estiver sobrecarregado. */
let geminiFallbacks: string[] = ["gemini-2.5-flash", "gemini-flash-lite-latest"];

async function pickGeminiModel(key: string): Promise<string> {
  if (geminiModel) return geminiModel;
  try {
    const res = await fetchWithTimeout(`${GEMINI_API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } }, 4000);
    if (res.ok) {
      const models: { name: string; supportedGenerationMethods?: string[] }[] = (await res.json()).models || [];
      const ids = models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((id) => !/(image|tts|audio|live|embedding|vision|robotics|computer)/.test(id));
      const ordered = [
        ...GEMINI_PREFERRED.filter((m) => ids.includes(m)),
        ...ids.filter((id) => /flash/.test(id) && !/lite|preview|exp/.test(id)),
        ...ids.filter((id) => /flash/.test(id) && /lite/.test(id) && !/preview|exp/.test(id)),
        ...ids.filter((id) => /flash/.test(id)),
      ].filter((id, i, all) => all.indexOf(id) === i);
      geminiModel = ordered[0] || "gemini-flash-latest";
      if (ordered.length > 1) geminiFallbacks = ordered.slice(1);
      return geminiModel;
    }
  } catch {
    /* usa o padrão */
  }
  return "gemini-flash-latest";
}

const isGeminiOverloaded = (httpStatus: number, status: string, detail: string) =>
  httpStatus === 500 || httpStatus === 503 || httpStatus === 504 || /UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED/.test(status) || /high demand|overloaded|try again later/i.test(detail);

// o Gemini exige devolver a "assinatura de raciocínio" de cada chamada de ferramenta;
// ela viaja dentro do id da tool_call, que o app devolve intacto
const encodeCallId = (signature: string | undefined, index: number) =>
  `gem_${index}_${Math.random().toString(36).slice(2, 8)}${signature ? `.${signature}` : ""}`;
const signatureFromId = (id: string) => {
  const dot = id.indexOf(".");
  return id.startsWith("gem_") && dot > 0 ? id.slice(dot + 1) : undefined;
};

/** Converte o JSON Schema das ferramentas para o subconjunto aceito pelo Gemini. */
function toGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  const out: Json = {};
  for (const [k, v] of Object.entries(schema as Json)) {
    if (["additionalProperties", "$schema", "default", "examples"].includes(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Json).map(([pk, pv]) => [pk, toGeminiSchema(pv)])) : toGeminiSchema(v);
  }
  return out;
}

function toGeminiRequest(messages: ChatMessage[], tools: ToolDef[] | undefined) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content || "").join("\n\n");
  const toolNames = new Map<string, string>();
  const contents: { role: "user" | "model"; parts: Json[] }[] = [];

  const push = (role: "user" | "model", parts: Json[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    // o Gemini espera turnos alternados: junta mensagens seguidas do mesmo lado
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") push("user", [{ text: m.content || "" }]);
    else if (m.role === "assistant") {
      const parts: Json[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.tool_calls || []) {
        toolNames.set(call.id, call.function.name);
        let args: Json = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* argumentos inválidos viram objeto vazio */
        }
        const signature = signatureFromId(call.id);
        parts.push({ functionCall: { name: call.function.name, args }, ...(signature ? { thoughtSignature: signature } : {}) });
      }
      push("model", parts.length ? parts : [{ text: "" }]);
    } else if (m.role === "tool") {
      push("user", [
        {
          functionResponse: {
            name: toolNames.get(m.tool_call_id || "") || "ferramenta",
            response: { result: m.content || "" },
          },
        },
      ]);
    }
  }

  const declarations = (tools || []).map((t) => {
    const params = t.function.parameters as Json | undefined;
    const hasProps = params && params.properties && Object.keys(params.properties as Json).length > 0;
    return { name: t.function.name, description: t.function.description || "", ...(hasProps ? { parameters: toGeminiSchema(params) } : {}) };
  });

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : {}),
  };
}

async function callGemini(key: string, messages: ChatMessage[], tools: ToolDef[] | undefined): Promise<AiReply> {
  const withTools = !!tools?.length;
  const primary = withTools ? await pickGeminiModel(key) : GEMINI_FAST[0];
  // no caminho rápido nem consultamos a lista de modelos: já vai direto no pedido
  const rest = withTools ? geminiFallbacks : [...GEMINI_FAST.slice(1), ...GEMINI_PREFERRED];
  const attempts = [primary, ...rest.filter((m) => m !== primary)].slice(0, 3);
  // escrever texto não precisa de raciocínio: desligar isso corta boa parte da espera
  const request = toGeminiRequest(messages, tools) as Json;
  request.generationConfig = withTools ? { maxOutputTokens: 4096 } : { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } };
  const payload = JSON.stringify(request);
  const noThinking = JSON.stringify({ ...request, generationConfig: { maxOutputTokens: withTools ? 4096 : 2048 } });

  let data: {
    candidates?: { content?: { parts?: Json[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  } | null = null;
  let model = primary;
  for (const candidate of attempts) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${GEMINI_API}/models/${candidate}:generateContent`,
        { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: payload },
        ATTEMPT_TIMEOUT_MS,
      );
    } catch {
      continue; // demorou demais: vai para o próximo modelo
    }
    let body = await res.json().catch(() => ({}));
    // alguns modelos recusam o pedido para desligar o raciocínio: repete sem essa parte
    if (!res.ok && res.status === 400 && !withTools) {
      try {
        res = await fetchWithTimeout(
          `${GEMINI_API}/models/${candidate}:generateContent`,
          { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: noThinking },
          ATTEMPT_TIMEOUT_MS,
        );
        body = await res.json().catch(() => ({}));
      } catch {
        continue;
      }
    }
    if (res.ok) {
      data = body;
      model = candidate;
      break;
    }
    const detail: string = body?.error?.message || "";
    const status: string = body?.error?.status || "";
    // modelo sobrecarregado ou inexistente: tenta o próximo da lista
    if (isGeminiOverloaded(res.status, status, detail)) continue;
    if (res.status === 404 || (res.status === 400 && /model/i.test(detail))) {
      if (candidate === geminiModel) geminiModel = Deno.env.get("GEMINI_MODEL") || "";
      continue;
    }
    if (/API key not valid|API_KEY_INVALID/i.test(detail) || res.status === 401)
      throw new ProviderError("A chave do Google Gemini configurada no servidor foi recusada. Crie uma nova em aistudio.google.com e troque o segredo GEMINI_API_KEY no Supabase.");
    if (res.status === 403 || status === "PERMISSION_DENIED")
      throw new ProviderError("A chave do Gemini não tem permissão para usar a API. Crie a chave pelo Google AI Studio (aistudio.google.com → Get API key).");
    if (res.status === 429 || status === "RESOURCE_EXHAUSTED")
      throw new ProviderError("A cota gratuita do Gemini acabou por agora. Espere um minuto e tente de novo; se continuar, a cota diária renova amanhã.");
    throw new ProviderError(detail || `O Gemini respondeu com erro ${res.status}.`);
  }
  if (!data) throw new ProviderError("O Gemini está sobrecarregado neste momento. Espere alguns segundos e tente de novo.");

  const candidate = data.candidates?.[0];
  const parts: Json[] = candidate?.content?.parts || [];
  const text = parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("")
    .trim();
  const calls: ToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p, i) => {
      const fc = p.functionCall as { name: string; args?: Json };
      return {
        id: encodeCallId(p.thoughtSignature as string | undefined, i),
        type: "function",
        function: { name: fc.name, arguments: JSON.stringify(fc.args || {}) },
      };
    });

  if (!text && !calls.length) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason;
    if (reason && /SAFETY|BLOCK|PROHIBITED|RECITATION/i.test(reason)) {
      throw new ProviderError("O Gemini bloqueou esta resposta pelos filtros de segurança. Reformule o pedido.", false);
    }
  }

  return { message: { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) }, model };
}

/* ---------------- Requisição ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return reply({ error: "Entre na sua conta para usar a IA." }, 401);

  // projetos novos podem usar a "publishable key" no lugar da anon key
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || req.headers.get("apikey") || "";
  // cliente com o login da pessoa: as regras de acesso do banco valem para ela
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return reply({ error: "Sua sessão expirou. Entre de novo." }, 401);

  const limit = Math.max(1, Number(Deno.env.get("AI_DAILY_LIMIT")) || 50);
  const provider = resolveProvider();

  let body: { action?: string; messages?: ChatMessage[]; tools?: ToolDef[] };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return reply({ error: "Texto grande demais para enviar à IA de uma vez. Use um trecho menor." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Pedido inválido." }, 400);
  }

  if (body.action === "usage") {
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const { data } = await supabase.from("ai_usage").select("count").eq("day", day).maybeSingle();
    return reply({ usage: { used: data?.count ?? 0, limit }, provider: provider?.provider ?? null });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) return reply({ error: "Pedido sem mensagens." }, 400);

  if (!provider) {
    return reply({ error: "A IA ainda não foi configurada no servidor: adicione o segredo GEMINI_API_KEY (Google) ou OPENAI_API_KEY (OpenAI) no Supabase." }, 500);
  }

  const { data: credit, error: creditError } = await supabase.rpc("consume_ai_credit", { p_limit: limit });
  if (creditError) return reply({ error: "Não foi possível conferir seu limite de uso. Confira se o SQL do projeto foi aplicado." }, 500);
  const usage = { used: credit.used as number, limit };
  if (!credit.allowed) return reply({ error: `Você usou os ${limit} pedidos de IA de hoje. O limite renova amanhã.`, usage }, 429);

  try {
    const result =
      provider.provider === "gemini"
        ? await callGemini(provider.key, body.messages, body.tools)
        : await callOpenAi(provider.key, body.messages, body.tools, userData.user.id);
    return reply({ ...result, usage, provider: provider.provider });
  } catch (e) {
    const refund = !(e instanceof ProviderError) || e.refund;
    if (refund) await supabase.rpc("refund_ai_credit");
    const message = e instanceof ProviderError ? e.message : "O servidor não conseguiu falar com o provedor de IA. Tente de novo.";
    return reply({ error: message, usage: { ...usage, used: refund ? usage.used - 1 : usage.used } }, 502);
  }
});
