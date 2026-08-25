-- VideoSearch vault copy of MongoDB (users, videos, highlights, screenshots, shares).
-- Applied with the service role. Browser clients (anon / authenticated) have no grants.

-- Legacy blob table from webapp/supabase-schema.sql — lock it down if present.
do $$
begin
  if to_regclass('public.vsa_vault') is not null then
    alter table public.vsa_vault enable row level security;
    revoke all on table public.vsa_vault from anon, authenticated;
    drop policy if exists "vsa_vault_select" on public.vsa_vault;
    drop policy if exists "vsa_vault_insert" on public.vsa_vault;
    drop policy if exists "vsa_vault_update" on public.vsa_vault;
  end if;
end
$$;

create table if not exists public.vault_users (
  user_id text primary key,
  email text,
  display_name text not null default '',
  google_id text not null default '',
  auth_provider text not null default 'password',
  last_seen_at timestamptz,
  token_version integer not null default 0,
  video_count integer not null default 0,
  highlight_count integer not null default 0,
  screenshot_count integer not null default 0,
  mongo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vault_users_email_idx
  on public.vault_users (email)
  where email is not null and email <> '';

create table if not exists public.vault_auth_events (
  id bigint generated always as identity primary key,
  user_id text not null,
  event text not null,
  provider text not null default 'password',
  created_at timestamptz not null default now()
);

create index if not exists vault_auth_events_user_idx
  on public.vault_auth_events (user_id, created_at desc);

create index if not exists vault_users_google_id_idx
  on public.vault_users (google_id)
  where google_id <> '';

create table if not exists public.vault_videos (
  user_id text not null,
  video_id text not null,
  video_title text not null default '',
  video_url text not null default '',
  channel_title text not null default '',
  channel_url text not null default '',
  bio_text text not null default '',
  bio_markdown text not null default '',
  bio_synced_at timestamptz,
  saved boolean not null default false,
  saved_at timestamptz,
  watch_later boolean not null default false,
  watch_later_at timestamptz,
  playlists text[] not null default '{}'::text[],
  last_viewed_at timestamptz,
  mongo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists vault_videos_user_updated_idx
  on public.vault_videos (user_id, updated_at desc);

create index if not exists vault_videos_saved_idx
  on public.vault_videos (user_id, saved_at desc)
  where saved = true;

create index if not exists vault_videos_watch_later_idx
  on public.vault_videos (user_id, watch_later_at desc)
  where watch_later = true;

create table if not exists public.vault_highlights (
  user_id text not null,
  video_id text not null,
  highlight_id text not null,
  start_time double precision,
  end_time double precision,
  note text not null default '',
  color text not null default '#ef4444',
  screenshot_id text,
  created_at timestamptz,
  updated_at timestamptz,
  primary key (user_id, video_id, highlight_id),
  foreign key (user_id, video_id)
    references public.vault_videos (user_id, video_id)
    on delete cascade
);

create index if not exists vault_highlights_user_idx
  on public.vault_highlights (user_id);

create table if not exists public.vault_screenshots (
  user_id text not null,
  video_id text not null,
  screenshot_id text not null,
  video_time double precision,
  note text not null default '',
  width integer,
  height integer,
  image_url text,
  r2_key text,
  supabase_key text,
  data_url text,
  backup_path text,
  fil_key text,
  cf_image_id text,
  cf_image_url text,
  created_at timestamptz,
  primary key (user_id, video_id, screenshot_id),
  foreign key (user_id, video_id)
    references public.vault_videos (user_id, video_id)
    on delete cascade
);

create index if not exists vault_screenshots_user_idx
  on public.vault_screenshots (user_id);

create table if not exists public.vault_source_links (
  user_id text not null,
  video_id text not null,
  link_id text not null,
  url text not null,
  label text not null default '',
  kind text not null default 'link',
  source text not null default 'description',
  start_time double precision,
  created_at timestamptz,
  primary key (user_id, video_id, link_id),
  foreign key (user_id, video_id)
    references public.vault_videos (user_id, video_id)
    on delete cascade
);

create index if not exists vault_source_links_user_idx
  on public.vault_source_links (user_id);

create table if not exists public.vault_shared_cards (
  token text primary key,
  user_id text not null,
  video_id text not null,
  snapshot jsonb not null default '{}'::jsonb,
  view_count integer not null default 0,
  expires_at timestamptz,
  mongo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_shared_cards_user_idx
  on public.vault_shared_cards (user_id, created_at desc);

alter table public.vault_users enable row level security;
alter table public.vault_auth_events enable row level security;
alter table public.vault_videos enable row level security;
alter table public.vault_highlights enable row level security;
alter table public.vault_screenshots enable row level security;
alter table public.vault_source_links enable row level security;
alter table public.vault_shared_cards enable row level security;

revoke all on table public.vault_users from anon, authenticated;
revoke all on table public.vault_auth_events from anon, authenticated;
revoke all on table public.vault_videos from anon, authenticated;
revoke all on table public.vault_highlights from anon, authenticated;
revoke all on table public.vault_screenshots from anon, authenticated;
revoke all on table public.vault_source_links from anon, authenticated;
revoke all on table public.vault_shared_cards from anon, authenticated;

grant select, insert, update, delete on table public.vault_users to service_role;
grant select, insert on table public.vault_auth_events to service_role;
grant usage, select on sequence public.vault_auth_events_id_seq to service_role;
grant select, insert, update, delete on table public.vault_videos to service_role;
grant select, insert, update, delete on table public.vault_highlights to service_role;
grant select, insert, update, delete on table public.vault_screenshots to service_role;
grant select, insert, update, delete on table public.vault_source_links to service_role;
grant select, insert, update, delete on table public.vault_shared_cards to service_role;

notify pgrst, 'reload schema';
