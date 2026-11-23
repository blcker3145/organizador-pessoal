-- Organizador pessoal: prospecção de empresas sem site.
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run.
--
-- Só a conta de quem administra o app (public.is_app_admin, criada no 0004_feedback.sql)
-- usa a prospecção. Cada linha também pertence à conta que a criou.

/* ---------- Empresas encontradas ---------- */

create table if not exists public.prospect_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- identificador do lugar no Google: evita a mesma empresa duas vezes
  place_id text not null,
  name text not null default '',
  category text not null default '',
  phone text not null default '',
  -- celular (provável WhatsApp), fixo ou vazio
  phone_kind text not null default '' check (phone_kind in ('', 'celular', 'fixo')),
  address text not null default '',
  rating numeric(2, 1),
  reviews integer not null default 0,
  maps_url text not null default '',
  -- o que o Google tem no campo de site: nada, só Instagram, só Facebook, link de bio...
  site_kind text not null default 'nenhum' check (site_kind in ('nenhum', 'instagram', 'facebook', 'link', 'whatsapp')),
  site_url text not null default '',
  -- busca que trouxe a empresa (ex.: "painel solar em Chapecó")
  search text not null default '',
  status text not null default 'encontrado'
    check (status in ('encontrado', 'qualificado', 'contatado', 'respondeu', 'reuniao', 'proposta', 'fechado', 'perdido')),
  -- qualificação (fase 2)
  score integer check (score between 0 and 100),
  temperature text check (temperature in ('quente', 'morno', 'frio')),
  reason text not null default '',
  message text not null default '',
  -- contato e acompanhamento (fase 3)
  contacted_at timestamptz,
  replied_at timestamptz,
  next_followup date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index if not exists prospect_leads_user_created_idx on public.prospect_leads (user_id, created_at desc);
create index if not exists prospect_leads_user_contacted_idx on public.prospect_leads (user_id, contacted_at);

drop trigger if exists prospect_leads_updated_at on public.prospect_leads;
create trigger prospect_leads_updated_at
  before insert or update on public.prospect_leads
  for each row execute function public.set_updated_at();

/* ---------- Buscas feitas ---------- */

create table if not exists public.prospect_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  found integer not null default 0,
  without_site integer not null default 0,
  inserted integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists prospect_searches_user_created_idx on public.prospect_searches (user_id, created_at desc);

/* ---------- Quem pediu para não receber mensagens ---------- */

create table if not exists public.prospect_blocklist (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- telefone só com números (ex.: 49999998888)
  phone text not null,
  place_id text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, phone)
);

/* ---------- Regras de acesso ---------- */

alter table public.prospect_leads enable row level security;
alter table public.prospect_searches enable row level security;
alter table public.prospect_blocklist enable row level security;
revoke all on table public.prospect_leads from anon;
revoke all on table public.prospect_searches from anon;
revoke all on table public.prospect_blocklist from anon;

drop policy if exists "dono usa os leads" on public.prospect_leads;
create policy "dono usa os leads" on public.prospect_leads
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

drop policy if exists "dono usa as buscas" on public.prospect_searches;
create policy "dono usa as buscas" on public.prospect_searches
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());

drop policy if exists "dono usa o bloqueio" on public.prospect_blocklist;
create policy "dono usa o bloqueio" on public.prospect_blocklist
  for all to authenticated
  using (auth.uid() = user_id and public.is_app_admin())
  with check (auth.uid() = user_id and public.is_app_admin());
