-- Configuración global de integraciones del panel (no por usuario), p. ej. el
-- ID de propiedad de GA4 y la clave de la cuenta de servicio de Google.
-- Solo service_role (la Edge Function) la lee. Nunca llega al navegador.
create table if not exists panel.integration_config (
  channel     text primary key check (channel in ('instagram','facebook','analytics','adsense','amazon')),
  config      jsonb not null default '{}'::jsonb,  -- p. ej. { property_id, service_account }
  updated_at  timestamptz not null default now()
);
comment on table panel.integration_config is 'Config global de integraciones (IDs, claves de servicio). Solo service_role.';

drop trigger if exists integration_config_set_updated_at on panel.integration_config;
create trigger integration_config_set_updated_at
  before update on panel.integration_config
  for each row execute function panel.set_updated_at();

alter table panel.integration_config enable row level security;
revoke all on panel.integration_config from anon, authenticated;
