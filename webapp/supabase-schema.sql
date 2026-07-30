-- VideoSearch AI vault — run in Supabase SQL editor once

create table if not exists public.vsa_vault (
  user_id text not null default 'default',
  video_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

alter table public.vsa_vault enable row level security;

-- Dev-friendly policies (tighten for production)
create policy "vsa_vault_select" on public.vsa_vault
  for select using (true);
create policy "vsa_vault_insert" on public.vsa_vault
  for insert with check (true);
create policy "vsa_vault_update" on public.vsa_vault
  for update using (true);

-- Storage bucket for screenshots
insert into storage.buckets (id, name, public)
values ('vsa-screenshots', 'vsa-screenshots', true)
on conflict (id) do nothing;

create policy "vsa_shots_public_read" on storage.objects
  for select using (bucket_id = 'vsa-screenshots');
create policy "vsa_shots_upload" on storage.objects
  for insert with check (bucket_id = 'vsa-screenshots');
create policy "vsa_shots_update" on storage.objects
  for update using (bucket_id = 'vsa-screenshots');
