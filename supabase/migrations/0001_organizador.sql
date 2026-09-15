-- Organizador pessoal: dados por conta e limite de uso da IA.
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → cole → Run.

/* ---------- Dados do app (um documento por conta) ---------- */

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- cada pessoa só enxerga e altera os próprios dados
drop policy if exists "ler os próprios dados" on public.user_data;
create policy "ler os próprios dados" on public.user_data
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "criar os próprios dados" on public.user_data;
create policy "criar os próprios dados" on public.user_data
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "atualizar os próprios dados" on public.user_data;
create policy "atualizar os próprios dados" on public.user_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "apagar os próprios dados" on public.user_data;
create policy "apagar os próprios dados" on public.user_data
  for delete to authenticated using (auth.uid() = user_id);

-- a data de atualização vem sempre do servidor
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_data_updated_at on public.user_data;
create trigger user_data_updated_at
  before insert or update on public.user_data
  for each row execute function public.set_updated_at();

/* ---------- Limite diário de pedidos à IA ---------- */

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- a pessoa pode ver o próprio uso, mas não alterar (só as funções abaixo alteram)
drop policy if exists "ver o próprio uso" on public.ai_usage;
create policy "ver o próprio uso" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

-- consome 1 pedido se ainda houver saldo no dia (horário de Brasília)
create or replace function public.consume_ai_credit(p_limit integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  insert into ai_usage (user_id, day, count)
  values (auth.uid(), v_day, 0)
  on conflict (user_id, day) do nothing;

  update ai_usage
     set count = count + 1
   where user_id = auth.uid() and day = v_day and count < p_limit
  returning count into v_count;

  if v_count is null then
    select count into v_count from ai_usage where user_id = auth.uid() and day = v_day;
    return json_build_object('allowed', false, 'used', v_count, 'limit', p_limit);
  end if;

  return json_build_object('allowed', true, 'used', v_count, 'limit', p_limit);
end;
$$;

-- devolve o pedido quando a OpenAI falha, para não gastar o limite da pessoa
create or replace function public.refund_ai_credit()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ai_usage
     set count = greatest(count - 1, 0)
   where user_id = auth.uid() and day = (now() at time zone 'America/Sao_Paulo')::date;
end;
$$;

revoke all on function public.consume_ai_credit(integer) from public, anon;
revoke all on function public.refund_ai_credit() from public, anon;
grant execute on function public.consume_ai_credit(integer) to authenticated;
grant execute on function public.refund_ai_credit() to authenticated;
