-- Panel de Control Multicanal — backend aislado en el schema `panel`.
-- No toca el schema `public`. Tokens OAuth accesibles únicamente por
-- service_role (la Edge Function); nunca por el navegador.

create schema if not exists panel;

-- Helper: mantiene updated_at.
create or replace function panel.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Conexiones OAuth por usuario + canal. Los tokens viven solo aquí, server-side.
create table if not exists panel.connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  channel          text not null check (channel in ('instagram','facebook','analytics','adsense','amazon')),
  status           text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  config           jsonb not null default '{}'::jsonb,
  last_synced_at   timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, channel)
);
comment on table panel.connections is 'Tokens OAuth por usuario+canal. Solo service_role; nunca expuesto al navegador.';

drop trigger if exists connections_set_updated_at on panel.connections;
create trigger connections_set_updated_at
  before update on panel.connections
  for each row execute function panel.set_updated_at();

-- Caché de snapshots normalizados (capa de caché 5–15 min).
create table if not exists panel.snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  period     text not null check (period in ('7d','30d')),
  data       jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (user_id, period)
);
comment on table panel.snapshots is 'Caché de DashboardSnapshot normalizado por usuario+periodo (TTL 5-15 min).';

-- Importaciones manuales de Amazon Afiliados (sin API de métricas en tiempo real).
create table if not exists panel.amazon_imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  commissions  numeric not null default 0,
  clicks       integer not null default 0,
  orders       integer not null default 0,
  conversion   numeric,
  uploaded_at  timestamptz not null default now()
);
comment on table panel.amazon_imports is 'Datos manuales de Amazon Afiliados (no hay API en tiempo real).';

-- RLS habilitada SIN políticas permisivas: solo service_role accede.
alter table panel.connections    enable row level security;
alter table panel.snapshots      enable row level security;
alter table panel.amazon_imports enable row level security;

revoke all on schema panel from anon, authenticated;
revoke all on all tables in schema panel from anon, authenticated;
