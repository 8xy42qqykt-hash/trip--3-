-- Safe for an existing database: creates only the link-preview cache table
-- and its index. It does not drop, alter, or delete trips, users, or messages.
begin;

create table if not exists public.link_preview_cache (
  url text primary key,
  preview jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists link_preview_cache_expiration
  on public.link_preview_cache (expires_at);

alter table public.link_preview_cache enable row level security;
revoke all on public.link_preview_cache from public, anon, authenticated;
grant all on public.link_preview_cache to service_role;

commit;
