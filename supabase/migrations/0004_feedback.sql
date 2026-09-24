-- Organizador pessoal: caixa de feedback (nota em estrelas + recado).
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run.
--
-- Cada pessoa logada envia o próprio feedback e vê só o que escreveu.
-- Quem administra o app (o e-mail abaixo) enxerga tudo.

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null default '',
  rating int not null check (rating between 1 and 5),
  message text not null default '',
  -- em que tela a pessoa estava
  page text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_created_idx on public.app_feedback (created_at desc);

-- e-mail de quem administra; troque aqui se mudar de conta
create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'fangerdesign@gmail.com';
$$;

alter table public.app_feedback enable row level security;
revoke all on table public.app_feedback from anon;

drop policy if exists "enviar o próprio feedback" on public.app_feedback;
create policy "enviar o próprio feedback" on public.app_feedback
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "ler o próprio feedback" on public.app_feedback;
create policy "ler o próprio feedback" on public.app_feedback
  for select to authenticated using (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "admin apaga feedback" on public.app_feedback;
create policy "admin apaga feedback" on public.app_feedback
  for delete to authenticated using (public.is_app_admin());
