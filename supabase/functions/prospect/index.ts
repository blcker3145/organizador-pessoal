// Função de prospecção do Supabase: busca empresas no Google Places,
// separa as que não têm site e guarda na tabela prospect_leads da pessoa.
// A chave do Google fica só nos segredos; ela nunca chega ao navegador.
//
// Segredo (Edge Functions → Secrets):
//   GOOGLE_PLACES_API_KEY   chave do Google Cloud com a "Places API (New)" ativada
// Opcional:
//   PROSPECT_MAX_PAGES      páginas de 20 resultados por busca (padrão 3, máximo 3)
//
// Publicar com o nome "prospect" e com Verify JWT ligado (exige login).

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
}

type SiteKind = "nenhum" | "instagram" | "facebook" | "link" | "whatsapp" | "site";

/** O que a empresa tem no campo de site. Só "site" conta como site de verdade. */
export function siteKind(url: string | undefined): SiteKind {
  const u = (url || "").trim().toLowerCase();
  if (!u) return "nenhum";
  if (/instagram\.com|instagr\.am/.test(u)) return "instagram";
  if (/facebook\.com|fb\.com|fb\.me/.test(u)) return "facebook";
  if (/wa\.me|whatsapp\.com|wa\.link/.test(u)) return "whatsapp";
  if (/linktr\.ee|linktree|bio\.link|beacons\.ai|taplink|campsite\.bio|linkbio|lnk\.bio|msha\.ke/.test(u)) return "link";
  return "site";
}

/** Celular no Brasil: DDD + 9 dígitos começando com 9. */
export function phoneKind(national: string | undefined, intl: string | undefined): "" | "celular" | "fixo" {
  const digits = (national || "").replace(/\D/g, "").replace(/^0/, "");
  if (!digits) return "";
  if (intl && !intl.trim().startsWith("+55")) return "fixo";
  if (digits.length === 11 && digits[2] === "9") return "celular";
  return "fixo";
}

class PlacesError extends Error {}

async function searchPlaces(key: string, query: string, maxPages: number): Promise<Place[]> {
  const all: Place[] = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = String(data?.error?.message || "");
      if (res.status === 403 || /not been used|disabled|API_KEY_SERVICE_BLOCKED/i.test(detail)) {
        throw new PlacesError("O Google recusou a chave. Confira se a Places API (New) está ativada e se o faturamento do projeto está ligado.");
      }
      if (res.status === 400 && /API key/i.test(detail)) throw new PlacesError("A chave do Google é inválida. Gere outra e troque o segredo GOOGLE_PLACES_API_KEY.");
      if (res.status === 429) throw new PlacesError("O Google limitou as buscas por agora. Tente de novo em alguns minutos.");
      throw new PlacesError(`O Google respondeu com erro (${res.status}). ${detail}`.trim());
    }
    all.push(...((data.places || []) as Place[]));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return reply({ error: "Entre na sua conta para prospectar." }, 401);

  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || req.headers.get("apikey") || "";
  // cliente com o login da pessoa: as regras de acesso do banco valem para ela
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return reply({ error: "Sua sessão expirou. Entre de novo." }, 401);

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_app_admin");
  if (adminError) return reply({ error: "Falta rodar o SQL do feedback no Supabase (0004_feedback.sql)." }, 500);
  if (!isAdmin) return reply({ error: "A prospecção é só para a conta de quem administra o app." }, 403);

  let body: { action?: string; query?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Pedido inválido." }, 400);
  }

  const key = (Deno.env.get("GOOGLE_PLACES_API_KEY") || "").trim();
  if (body.action === "status") return reply({ configured: !!key });
  if (body.action !== "search") return reply({ error: "Ação desconhecida." }, 400);

  const query = (body.query || "").trim().slice(0, 120);
  if (query.length < 3) return reply({ error: "Escreva o nicho e a cidade. Ex.: painel solar em Chapecó." }, 400);
  if (!key) return reply({ error: "Falta o segredo GOOGLE_PLACES_API_KEY no Supabase (Edge Functions → Secrets)." }, 500);

  const maxPages = Math.min(3, Math.max(1, Number(Deno.env.get("PROSPECT_MAX_PAGES")) || 3));

  let places: Place[];
  try {
    places = await searchPlaces(key, query, maxPages);
  } catch (e) {
    return reply({ error: e instanceof PlacesError ? e.message : "Não foi possível falar com o Google agora. Tente de novo." }, 502);
  }

  const open = places.filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL");
  const rows = open
    .map((p) => ({ p, kind: siteKind(p.websiteUri) }))
    .filter(({ kind }) => kind !== "site")
    .map(({ p, kind }) => ({
      user_id: userData.user.id,
      place_id: p.id,
      name: (p.displayName?.text || "").slice(0, 200),
      category: (p.primaryTypeDisplayName?.text || "").slice(0, 120),
      phone: p.nationalPhoneNumber || "",
      phone_kind: phoneKind(p.nationalPhoneNumber, p.internationalPhoneNumber),
      address: (p.formattedAddress || "").slice(0, 300),
      rating: typeof p.rating === "number" ? Math.round(p.rating * 10) / 10 : null,
      reviews: p.userRatingCount || 0,
      maps_url: p.googleMapsUri || "",
      site_kind: kind,
      site_url: kind === "nenhum" ? "" : (p.websiteUri || "").slice(0, 500),
      search: query,
    }));

  let inserted = 0;
  if (rows.length) {
    // empresa que já estava na lista fica como está (mantém etapa e anotações)
    const { data, error } = await supabase
      .from("prospect_leads")
      .upsert(rows, { onConflict: "user_id,place_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      const missing = /schema cache|does not exist/i.test(error.message);
      return reply({ error: missing ? "Falta rodar o SQL da prospecção no Supabase (0005_prospeccao.sql)." : error.message }, 500);
    }
    inserted = data?.length || 0;
  }

  const summary = { query, found: places.length, closed: places.length - open.length, withoutSite: rows.length, inserted };
  await supabase.from("prospect_searches").insert({
    user_id: userData.user.id,
    query,
    found: summary.found,
    without_site: summary.withoutSite,
    inserted,
  });
  return reply(summary);
});
