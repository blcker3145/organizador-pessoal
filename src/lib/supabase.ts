import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Endereço e chave pública (anon) do projeto. São públicos por natureza:
// quem protege os dados são as regras de acesso (RLS) do banco.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || "";

export const supabaseConfigured = !!url && !!anonKey;

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // "pkce" devolve ?code= na URL e não conflita com as rotas em #/
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Endereço para onde os e-mails de confirmação e de nova senha voltam. */
export function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
