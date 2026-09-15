// Função "ai" do Supabase: recebe o pedido do app, confere o login e o limite
// diário da pessoa e chama a OpenAI com a chave guardada nos segredos do projeto.
// A chave nunca chega ao navegador.
//
// Segredos (Edge Functions → Secrets):
//   OPENAI_API_KEY   obrigatório
//   AI_DAILY_LIMIT   opcional, pedidos por pessoa por dia (padrão 50)
//   OPENAI_MODEL     opcional, ex.: gpt-4o-mini (padrão: escolhe sozinho)

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PREFERRED_MODELS = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini", "gpt-5", "gpt-4.1", "gpt-4o"];
const MAX_BODY_CHARS = 120_000;

let cachedModel = Deno.env.get("OPENAI_MODEL") || "";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function pickModel(apiKey: string): Promise<string> {
  if (cachedModel) return cachedModel;
  try {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const ids: string[] = (await res.json()).data.map((m: { id: string }) => m.id);
      cachedModel = PREFERRED_MODELS.find((m) => ids.includes(m)) || ids.find((id) => /^gpt-.*mini/.test(id)) || "gpt-4o-mini";
      return cachedModel;
    }
  } catch {
    /* usa o padrão */
  }
  return "gpt-4o-mini";
}

function openAiErrorMessage(status: number, detail: string): string {
  if (status === 401) return "A chave da OpenAI configurada no servidor é inválida. Troque o segredo OPENAI_API_KEY no Supabase.";
  if (status === 429 && /quota|billing/i.test(detail)) return "A conta da OpenAI está sem créditos. Adicione saldo em platform.openai.com → Billing.";
  if (status === 429) return "Muitos pedidos seguidos para a OpenAI. Espere alguns segundos e tente de novo.";
  if (/model/i.test(detail)) return `O modelo configurado não está disponível: ${detail}`;
  return detail || `A OpenAI respondeu com erro ${status}.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return reply({ error: "Entre na sua conta para usar a IA." }, 401);

  // cliente com o login da pessoa: as regras de acesso do banco valem para ela
  // projetos novos podem usar a "publishable key" no lugar da anon key
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || req.headers.get("apikey") || "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return reply({ error: "Sua sessão expirou. Entre de novo." }, 401);

  const limit = Math.max(1, Number(Deno.env.get("AI_DAILY_LIMIT")) || 50);

  let body: { action?: string; messages?: unknown[]; tools?: unknown[] };
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
    return reply({ usage: { used: data?.count ?? 0, limit } });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) return reply({ error: "Pedido sem mensagens." }, 400);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return reply({ error: "A IA ainda não foi configurada no servidor: falta o segredo OPENAI_API_KEY no Supabase." }, 500);

  const { data: credit, error: creditError } = await supabase.rpc("consume_ai_credit", { p_limit: limit });
  if (creditError) return reply({ error: "Não foi possível conferir seu limite de uso. Confira se o SQL do projeto foi aplicado." }, 500);
  const usage = { used: credit.used as number, limit };
  if (!credit.allowed) return reply({ error: `Você usou os ${limit} pedidos de IA de hoje. O limite renova amanhã.`, usage }, 429);

  try {
    const model = await pickModel(apiKey);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: body.messages,
        ...(Array.isArray(body.tools) && body.tools.length ? { tools: body.tools } : {}),
        user: userData.user.id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await supabase.rpc("refund_ai_credit");
      if (/model/i.test(data?.error?.message || "")) cachedModel = Deno.env.get("OPENAI_MODEL") || "";
      return reply({ error: openAiErrorMessage(res.status, data?.error?.message || ""), usage: { ...usage, used: usage.used - 1 } }, 502);
    }
    return reply({ message: data.choices?.[0]?.message ?? { content: "" }, usage, model });
  } catch {
    await supabase.rpc("refund_ai_credit");
    return reply({ error: "O servidor não conseguiu falar com a OpenAI. Tente de novo." }, 502);
  }
});
