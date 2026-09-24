/* Feedback do app: nota em estrelas e recado, guardados no Supabase. */
import { supabase } from "./supabase";

/** Conta que enxerga todos os feedbacks (a mesma da política no banco). */
export const ADMIN_EMAIL = "fangerdesign@gmail.com";

export interface Feedback {
  id: string;
  email: string;
  rating: number;
  message: string;
  page: string;
  created_at: string;
}

export class FeedbackError extends Error {}

const faltaTabela = (message: string) => /schema cache|does not exist|relation .* does not exist/i.test(message);

export async function sendFeedback(rating: number, message: string, page: string) {
  if (!supabase) throw new FeedbackError("O servidor ainda não foi configurado.");
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new FeedbackError("Entre na sua conta para enviar feedback.");
  const { error } = await supabase.from("app_feedback").insert({
    user_id: user.id,
    email: user.email || "",
    rating,
    message: message.trim().slice(0, 2000),
    page: page.slice(0, 120),
  });
  if (error) throw new FeedbackError(faltaTabela(error.message) ? "Falta rodar o SQL do feedback no Supabase (0004_feedback.sql)." : error.message);
}

export async function listFeedback(): Promise<Feedback[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("app_feedback").select("id, email, rating, message, page, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw new FeedbackError(faltaTabela(error.message) ? "Falta rodar o SQL do feedback no Supabase (0004_feedback.sql)." : error.message);
  return (data || []) as Feedback[];
}

export async function deleteFeedback(id: string) {
  if (!supabase) return;
  await supabase.from("app_feedback").delete().eq("id", id);
}
