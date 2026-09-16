-- Organizador pessoal: conexão com o Google Agenda.
-- Rode no Supabase: SQL Editor → New query → cole → Run.

-- Guarda a autorização de longo prazo (refresh token) de cada conta.
-- Sem políticas de acesso: só a função do servidor (service role) lê e grava.
-- O navegador nunca enxerga o token.
create table if not exists public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

revoke all on table public.google_connections from anon, authenticated;
