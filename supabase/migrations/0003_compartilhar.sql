-- Organizador pessoal: compartilhar o quadro de Criativos por link.
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run.
--
-- Quem abre o link não entra na sua conta: quem lê os dados é a função "share"
-- (service role), que devolve só os criativos. As tabelas abaixo ficam fechadas:
-- pelas regras de acesso, apenas o dono enxerga e altera o que é dele.

/* ---------- Links criados ---------- */

create table if not exists public.board_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  title text not null default 'Criativos',
  allow_comments boolean not null default true,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists board_shares_owner_idx on public.board_shares (owner_id);

/* ---------- Quem abriu o link e pediu para comentar ---------- */

create table if not exists public.share_viewers (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.board_shares (id) on delete cascade,
  -- código aleatório guardado no navegador de quem visita; não é login
  viewer_key text not null,
  name text not null default '',
  email text not null default '',
  message text not null default '',
  -- pending | approved | denied
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (share_id, viewer_key)
);

create index if not exists share_viewers_share_idx on public.share_viewers (share_id);

/* ---------- Comentários nos cards ---------- */

create table if not exists public.share_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.board_shares (id) on delete cascade,
  viewer_id uuid references public.share_viewers (id) on delete set null,
  card_id text not null default '',
  author text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists share_comments_share_idx on public.share_comments (share_id, created_at);

/* ---------- Regras de acesso: só o dono ---------- */

alter table public.board_shares enable row level security;
alter table public.share_viewers enable row level security;
alter table public.share_comments enable row level security;

revoke all on table public.board_shares from anon;
revoke all on table public.share_viewers from anon;
revoke all on table public.share_comments from anon;

drop policy if exists "dono vê os próprios links" on public.board_shares;
create policy "dono vê os próprios links" on public.board_shares
  for select to authenticated using (auth.uid() = owner_id);

drop policy if exists "dono cria links" on public.board_shares;
create policy "dono cria links" on public.board_shares
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists "dono altera os próprios links" on public.board_shares;
create policy "dono altera os próprios links" on public.board_shares
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "dono apaga os próprios links" on public.board_shares;
create policy "dono apaga os próprios links" on public.board_shares
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "dono vê os pedidos" on public.share_viewers;
create policy "dono vê os pedidos" on public.share_viewers
  for select to authenticated using (
    exists (select 1 from public.board_shares s where s.id = share_id and s.owner_id = auth.uid())
  );

drop policy if exists "dono responde os pedidos" on public.share_viewers;
create policy "dono responde os pedidos" on public.share_viewers
  for update to authenticated using (
    exists (select 1 from public.board_shares s where s.id = share_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.board_shares s where s.id = share_id and s.owner_id = auth.uid())
  );

drop policy if exists "dono apaga pedidos" on public.share_viewers;
create policy "dono apaga pedidos" on public.share_viewers
  for delete to authenticated using (
    exists (select 1 from public.board_shares s where s.id = share_id and s.owner_id = auth.uid())
  );

drop policy if exists "dono lê os comentários" on public.share_comments;
create policy "dono lê os comentários" on public.share_comments
  for select to authenticated using (
    exists (select 1 from public.board_shares s where s.id = share_id and s.owner_id = auth.uid())
  );

drop policy if exists "dono apaga comentários" on public.share_comments;
create policy "dono apaga comentários" on public.share_comments
  for delete to authenticated using (
    exists (select 1 from public.board_shares s where s.id = share_id and s.owner_id = auth.uid())
  );
