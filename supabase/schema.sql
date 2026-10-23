-- ====================================================================
-- TRIP APP: Complete Supabase Fresh Reset & Schema Installation
-- DESTRUCTIVE: this script drops public tables and deletes their data.
-- Never run it against an existing/production database with trips, users,
-- messages, or other data you need to keep. For link previews on an existing
-- database, run only supabase/migrations/20261026_link_preview_cache.sql.
-- ====================================================================

-- 1. DROP EXISTING TRIGGERS, FUNCTIONS, POLICIES & TABLES
drop trigger if exists on_auth_user_created on auth.users cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.sanitize_profile_display_name() cascade;
drop function if exists public.is_trip_member(uuid) cascade;
drop function if exists public.generate_invite_code() cascade;
drop function if exists public.create_trip(text, date, date) cascade;
drop function if exists public.join_trip(text) cascade;
drop function if exists public.end_poll(uuid) cascade;

-- WARNING: this reset drops every application table in public. Export any data
-- you need before running it. Supabase Storage objects cannot be safely deleted
-- from SQL; this script preserves existing buckets and files.
do $$
declare
  table_row record;
begin
  for table_row in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop table if exists public.%I cascade', table_row.tablename);
  end loop;
end $$;

drop table if exists public.event_attendees cascade;
drop table if exists public.events cascade;
drop table if exists public.meal_votes cascade;
drop table if exists public.meals cascade;
drop table if exists public.grocery_items cascade;
drop table if exists public.poll_votes cascade;
drop table if exists public.poll_options cascade;
drop table if exists public.polls cascade;
drop table if exists public.reactions cascade;
drop table if exists public.messages cascade;
drop table if exists public.trip_members cascade;
drop table if exists public.trips cascade;
drop table if exists public.profiles cascade;

-- 2. CREATE OR UPDATE THE APP STORAGE BUCKET WITHOUT DELETING STORAGE DATA.
-- Empty/delete buckets and their files through the Supabase Storage API or
-- Dashboard; direct DELETE statements against storage tables are prohibited.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-assets', 'trip-assets', true, 52428800, null)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload to trip-assets" on storage.objects;
drop policy if exists "Public can view trip-assets" on storage.objects;
drop policy if exists "Authenticated users can update trip-assets" on storage.objects;
drop policy if exists "Authenticated users can delete trip-assets" on storage.objects;

create policy "Public can view trip-assets"
  on storage.objects for select
  using (bucket_id = 'trip-assets');

create policy "Authenticated users can upload to trip-assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-assets');

create policy "Authenticated users can update trip-assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'trip-assets');

create policy "Authenticated users can delete trip-assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'trip-assets');

-- 3. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 4. PROFILES TABLE
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  color text not null default '#007AFF',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create or replace function public.sanitize_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  new.display_name := btrim(new.display_name);
  select email into v_email from auth.users where id = new.id;
  if new.display_name = ''
     or position('@' in new.display_name) > 0
     or (v_email is not null and lower(new.display_name) = lower(split_part(v_email, '@', 1)))
     or new.display_name ~ '^\+?[0-9][0-9(). -]{6,}$' then
    new.display_name := 'Trip member';
  end if;
  return new;
end;
$$;

create trigger sanitize_profile_display_name_before_write
  before insert or update of display_name on public.profiles
  for each row execute function public.sanitize_profile_display_name();

-- 5. TRIPS TABLE
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  invite_code text unique not null,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. TRIP MEMBERS TABLE
create table public.trip_members (
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member',
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (trip_id, user_id)
);

-- 7. MESSAGES TABLE
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null default 'text', -- 'text' | 'image' | 'poll_result'
  content text not null default '',
  image_url text,
  reply_to uuid references public.messages(id) on delete set null,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Backend-only cache for link preview metadata.
create table public.link_preview_cache (
  url text primary key,
  preview jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index link_preview_cache_expiration
  on public.link_preview_cache (expires_at);
revoke all on public.link_preview_cache from public, anon, authenticated;
grant all on public.link_preview_cache to service_role;

-- 8. REACTIONS TABLE
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  kind text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (message_id, user_id, kind)
);

-- 9. POLLS & OPTIONS & VOTES
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  question text not null,
  multiple boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  text text not null,
  sort_order integer not null default 0
);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  option_id uuid references public.poll_options(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (poll_id, option_id, user_id)
);

-- 10. GROCERY ITEMS
create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  text text not null,
  quantity text,
  category text not null default 'Other',
  is_done boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 11. MEALS & VOTES
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  slot text not null default 'Meal',
  name text not null,
  cook_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.meal_votes (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid references public.meals(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (meal_id, user_id)
);

-- 12. EVENTS & ATTENDEES
create table public.events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  time text,
  title text not null,
  location text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (event_id, user_id)
);

-- 13. INVITATIONS AND PUSH SUBSCRIPTION STORAGE
create table public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  inviter_id uuid references public.profiles(id) on delete cascade not null,
  invitee_user_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  email_sent_at timestamptz
);
create unique index trip_invitations_pending_email
  on public.trip_invitations (trip_id, lower(email))
  where status = 'pending';
create index trip_invitations_invitee_status
  on public.trip_invitations (invitee_user_id, status, expires_at);

create table public.call_sessions (
  call_id text primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  kind text not null check (kind in ('audio', 'video')),
  host_id uuid references public.profiles(id) on delete cascade not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  participants uuid[] not null default '{}',
  participant_history uuid[] not null default '{}'
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  enabled boolean not null default true,
  categories jsonb not null default '{"messages":true,"calls":true,"polls":true,"reactions":true,"invitations":true,"trip_updates":true}'::jsonb,
  muted_trip_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.trip_user_activity (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  is_focused boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notification_events (
  id bigint generated always as identity primary key,
  trip_id uuid references public.trips(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete cascade not null,
  category text not null,
  preview text not null,
  destination text not null,
  high_priority boolean not null default false,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index notification_events_pending
  on public.notification_events (trip_id, recipient_id, created_at)
  where sent_at is null;

-- 14. ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.messages enable row level security;
alter table public.link_preview_cache enable row level security;
alter table public.reactions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.grocery_items enable row level security;
alter table public.meals enable row level security;
alter table public.meal_votes enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.trip_invitations enable row level security;
alter table public.call_sessions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.trip_user_activity enable row level security;
alter table public.notification_events enable row level security;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid()
  );
$$;

create or replace function public.enqueue_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_trip_id uuid;
  v_actor_id uuid;
  v_recipient_id uuid;
  v_category text := 'messages';
  v_preview text := 'There is an update in your trip.';
  v_destination text;
  v_high_priority boolean := false;
  v_message_type text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name = 'trip_invitations' and tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
  end if;
  v_actor_id := coalesce(
    auth.uid(),
    nullif(v_row->>'user_id', '')::uuid,
    nullif(v_row->>'creator_id', '')::uuid,
    nullif(v_row->>'host_id', '')::uuid,
    nullif(v_row->>'inviter_id', '')::uuid
  );

  if tg_table_name = 'messages' then
    v_trip_id := (v_row->>'trip_id')::uuid;
    v_message_type := v_row->>'type';
    if v_message_type = 'call' then
      return new;
    elsif tg_op = 'UPDATE' then
      v_category := case when v_message_type = 'poll_result' then 'polls' else 'messages' end;
      v_preview := case v_message_type
        when 'grocery_list' then 'Updated a grocery list'
        when 'meal' then 'Updated a meal'
        when 'plan' then 'Updated a plan'
        when 'image' then 'Updated a photo'
        else 'Edited a message'
      end;
    else
      v_category := case when v_message_type = 'poll_result' then 'polls' else 'messages' end;
      v_preview := case v_message_type
        when 'image' then 'Sent a photo'
        when 'grocery_list' then 'Sent a grocery list'
        when 'meal' then 'Added a meal'
        when 'plan' then 'Added a plan'
        when 'poll_result' then 'Poll results are ready'
        else left(coalesce(v_row->>'content', 'Sent a message'), 120)
      end;
    end if;
  elsif tg_table_name in ('grocery_items', 'meals', 'events', 'polls', 'trips') then
    v_trip_id := (v_row->>'trip_id')::uuid;
    if tg_table_name = 'grocery_items' then
      v_category := 'messages';
      v_preview := case when tg_op = 'UPDATE' then 'Updated the grocery list' else 'Added grocery items' end;
    elsif tg_table_name = 'meals' then
      v_category := 'messages';
      v_preview := case when tg_op = 'UPDATE' then 'Updated a meal' else 'Added a meal' end;
    elsif tg_table_name = 'events' then
      v_category := 'messages';
      v_preview := case when tg_op = 'UPDATE' then 'Updated a plan' else 'Added a plan' end;
    elsif tg_table_name = 'polls' then
      v_category := 'polls';
      v_preview := case when tg_op = 'UPDATE' then 'Updated a poll' else 'Created a poll' end;
    else
      v_trip_id := (v_row->>'id')::uuid;
      v_category := 'trip_updates';
      v_preview := 'Updated trip details';
    end if;
  elsif tg_table_name = 'reactions' then
    select m.trip_id into v_trip_id from public.messages m where m.id = (v_row->>'message_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'reactions';
    v_preview := 'Reacted to a message';
  elsif tg_table_name = 'poll_votes' then
    select p.trip_id into v_trip_id
      from public.poll_options po join public.polls p on p.id = po.poll_id
      where po.id = (v_row->>'option_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'polls';
    v_preview := 'Voted in a poll';
  elsif tg_table_name = 'meal_votes' then
    select m.trip_id into v_trip_id from public.meals m where m.id = (v_row->>'meal_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'messages';
    v_preview := 'Liked a meal';
  elsif tg_table_name = 'event_attendees' then
    select e.trip_id into v_trip_id from public.events e where e.id = (v_row->>'event_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'messages';
    v_preview := case when tg_op = 'DELETE' then 'Changed plan attendance' else 'Will contribute to a plan' end;
  elsif tg_table_name = 'trip_invitations' then
    v_trip_id := (v_row->>'trip_id')::uuid;
    if tg_op = 'INSERT' then
      v_actor_id := (v_row->>'inviter_id')::uuid;
      v_recipient_id := nullif(v_row->>'invitee_user_id', '')::uuid;
      v_category := 'invitations';
      v_preview := 'Invited you to join a trip';
      v_destination := '/?invitation=' || (v_row->>'id');
    else
      v_actor_id := coalesce(auth.uid(), (v_row->>'invitee_user_id')::uuid);
      v_recipient_id := (v_row->>'inviter_id')::uuid;
      v_category := 'invitations';
      v_preview := case v_row->>'status'
        when 'accepted' then 'Accepted your trip invitation'
        when 'rejected' then 'Declined your trip invitation'
        else 'Updated a trip invitation'
      end;
    end if;
  elsif tg_table_name = 'trip_members' then
    v_trip_id := (v_row->>'trip_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'trip_updates';
    v_preview := case
      when tg_op = 'DELETE' and v_actor_id <> (v_row->>'user_id')::uuid then 'Removed a member from the trip'
      when tg_op = 'DELETE' then 'Left the trip'
      else 'Joined the trip'
    end;
  elsif tg_table_name = 'call_sessions' then
    v_trip_id := (v_row->>'trip_id')::uuid;
    v_actor_id := (v_row->>'host_id')::uuid;
    v_category := 'calls';
    v_preview := case when v_row->>'kind' = 'video' then 'Started a video call' else 'Started a voice call' end;
    v_destination := '/?trip=' || v_trip_id || '&view=messages&call=' || (v_row->>'call_id');
    v_high_priority := true;
  else
    return new;
  end if;

  if v_destination is null and v_trip_id is not null then
    v_destination := '/?trip=' || v_trip_id || '&view=messages';
  end if;

  if tg_table_name = 'trip_invitations' then
    if v_recipient_id is not null and v_recipient_id <> v_actor_id then
      insert into public.notification_events (trip_id, actor_id, recipient_id, category, preview, destination, high_priority)
      values (v_trip_id, v_actor_id, v_recipient_id, v_category, v_preview, v_destination, v_high_priority);
    end if;
  elsif v_trip_id is not null then
    insert into public.notification_events (trip_id, actor_id, recipient_id, category, preview, destination, high_priority)
    select v_trip_id, v_actor_id, tm.user_id, v_category, v_preview, v_destination, v_high_priority
      from public.trip_members tm
      where tm.trip_id = v_trip_id
        and exists (select 1 from public.trips t where t.id = v_trip_id)
        and tm.user_id <> coalesce(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists notify_messages on public.messages;
create trigger notify_messages after insert or update on public.messages
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_reactions on public.reactions;
create trigger notify_reactions after insert on public.reactions
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_polls on public.polls;
create trigger notify_polls after insert or update on public.polls
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_poll_votes on public.poll_votes;
create trigger notify_poll_votes after insert on public.poll_votes
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_grocery_items on public.grocery_items;
create trigger notify_grocery_items after insert or update on public.grocery_items
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_meals on public.meals;
create trigger notify_meals after insert or update on public.meals
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_meal_votes on public.meal_votes;
create trigger notify_meal_votes after insert on public.meal_votes
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_events on public.events;
create trigger notify_events after insert or update on public.events
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_event_attendees on public.event_attendees;
create trigger notify_event_attendees after insert or delete on public.event_attendees
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_trip_invitations on public.trip_invitations;
create trigger notify_trip_invitations after insert or update on public.trip_invitations
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_trip_members on public.trip_members;
create trigger notify_trip_members after insert or delete on public.trip_members
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_trip_updates on public.trips;
create trigger notify_trip_updates after update on public.trips
  for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_call_sessions on public.call_sessions;
create trigger notify_call_sessions after insert on public.call_sessions
  for each row execute function public.enqueue_notification_event();

create or replace function public.create_trip_invitation(p_trip_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(p_email));
  v_invitee_id uuid;
  v_invitation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if not exists (
    select 1 from public.trips
    where id = p_trip_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the trip owner can invite people';
  end if;
  update public.trip_invitations
    set status = 'expired'
    where trip_id = p_trip_id and lower(email) = v_email
      and status = 'pending' and expires_at <= now();
  select id into v_invitee_id
    from auth.users
    where lower(email) = v_email and email_confirmed_at is not null
    limit 1;
  if v_invitee_id is not null and exists (
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = v_invitee_id
  ) then
    raise exception 'This person is already a trip member';
  end if;
  if exists (
    select 1 from public.trip_invitations
    where trip_id = p_trip_id and lower(email) = v_email and status = 'pending' and expires_at > now()
  ) then
    raise exception 'An active invitation already exists for this email';
  end if;
  insert into public.trip_invitations (trip_id, inviter_id, invitee_user_id, email)
  values (p_trip_id, auth.uid(), v_invitee_id, v_email)
  returning id into v_invitation_id;
  return v_invitation_id;
end;
$$;

create or replace function public.respond_to_trip_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.trip_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_invitation
    from public.trip_invitations
    where id = p_invitation_id and invitee_user_id = auth.uid()
    for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'This invitation is no longer active';
  end if;
  if p_accept then
    insert into public.trip_members (trip_id, user_id, role)
    values (v_invitation.trip_id, auth.uid(), 'member')
    on conflict (trip_id, user_id) do nothing;
    update public.trip_invitations
      set status = 'accepted', responded_at = now()
      where id = p_invitation_id;
  else
    update public.trip_invitations
      set status = 'rejected', responded_at = now()
      where id = p_invitation_id;
  end if;
  return v_invitation.trip_id;
end;
$$;

create or replace function public.link_pending_trip_invitations()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.trip_invitations
      set invitee_user_id = new.id
      where lower(email) = lower(new.email)
        and status = 'pending'
        and expires_at > now()
        and invitee_user_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_link_pending_trip_invitations_after_auth on auth.users;
create trigger zz_link_pending_trip_invitations_after_auth
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.link_pending_trip_invitations();

-- 14. CLEAN NON-RECURSIVE RLS POLICIES
-- Profiles
create policy "Allow all authenticated to read profiles" on public.profiles for select to authenticated using (true);
create policy "Allow users to update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Allow users to insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Trips
create policy "Allow authenticated users to read trips" on public.trips for select to authenticated using (public.is_trip_member(id));
create policy "Allow authenticated users to create trips" on public.trips for insert to authenticated with check (auth.uid() = owner_id);
create policy "Allow owners to update trips" on public.trips for update to authenticated using (owner_id = auth.uid());
create policy "Allow owners to delete trips" on public.trips for delete to authenticated using (owner_id = auth.uid());

-- Trip Members
create policy "Allow authenticated users to read trip members" on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
create policy "Allow users to leave or owners to remove members" on public.trip_members for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
);

-- Messages
create policy "Allow authenticated users to read messages" on public.messages for select to authenticated using (public.is_trip_member(trip_id));
create policy "Allow authenticated users to send messages" on public.messages for insert to authenticated with check (auth.uid() = user_id and public.is_trip_member(trip_id));
create policy "Trip members can update structured messages" on public.messages for update to authenticated using (
  public.is_trip_member(trip_id) and (user_id = auth.uid() or type in ('grocery_list', 'meal', 'plan', 'call'))
) with check (public.is_trip_member(trip_id));
create policy "Allow message authors to delete messages" on public.messages for delete to authenticated using (auth.uid() = user_id);

-- Reactions
create policy "Allow authenticated users to read reactions" on public.reactions for select to authenticated using (
  exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_trip_member(m.trip_id))
);
create policy "Allow authenticated users to insert reactions" on public.reactions for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_trip_member(m.trip_id))
);
create policy "Allow users to delete own reactions" on public.reactions for delete to authenticated using (auth.uid() = user_id);

-- Polls, Options & Votes
create policy "Allow authenticated users to read polls" on public.polls for select to authenticated using (public.is_trip_member(trip_id));
create policy "Allow authenticated users to create polls" on public.polls for insert to authenticated with check (auth.uid() = creator_id and public.is_trip_member(trip_id));
create policy "Allow creators to update polls" on public.polls for update to authenticated using (creator_id = auth.uid() and public.is_trip_member(trip_id));

create policy "Allow authenticated users to read poll options" on public.poll_options for select to authenticated using (
  exists (select 1 from public.polls p where p.id = poll_options.poll_id and public.is_trip_member(p.trip_id))
);
create policy "Allow authenticated users to insert poll options" on public.poll_options for insert to authenticated with check (
  exists (select 1 from public.polls p where p.id = poll_options.poll_id and p.creator_id = auth.uid() and public.is_trip_member(p.trip_id))
);

create policy "Allow authenticated users to read poll votes" on public.poll_votes for select to authenticated using (
  exists (select 1 from public.poll_options o join public.polls p on p.id = o.poll_id where o.id = poll_votes.option_id and public.is_trip_member(p.trip_id))
);
create policy "Allow authenticated users to insert poll votes" on public.poll_votes for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.poll_options o join public.polls p on p.id = o.poll_id where o.id = poll_votes.option_id and public.is_trip_member(p.trip_id))
);
create policy "Allow users to delete own poll votes" on public.poll_votes for delete to authenticated using (auth.uid() = user_id);

-- Groceries
create policy "Allow authenticated users to read groceries" on public.grocery_items for select to authenticated using (public.is_trip_member(trip_id));
create policy "Allow authenticated users to insert groceries" on public.grocery_items for insert to authenticated with check (auth.uid() = user_id and public.is_trip_member(trip_id));
create policy "Allow authenticated users to update groceries" on public.grocery_items for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Allow authenticated users to delete groceries" on public.grocery_items for delete to authenticated using (public.is_trip_member(trip_id));

-- Meals
create policy "Allow authenticated users to read meals" on public.meals for select to authenticated using (public.is_trip_member(trip_id));
create policy "Allow authenticated users to insert meals" on public.meals for insert to authenticated with check (auth.uid() = user_id and public.is_trip_member(trip_id));
create policy "Allow authenticated users to update meals" on public.meals for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Allow authenticated users to delete meals" on public.meals for delete to authenticated using (public.is_trip_member(trip_id));

create policy "Allow authenticated users to read meal votes" on public.meal_votes for select to authenticated using (
  exists (select 1 from public.meals m where m.id = meal_votes.meal_id and public.is_trip_member(m.trip_id))
);
create policy "Allow authenticated users to insert meal votes" on public.meal_votes for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.meals m where m.id = meal_votes.meal_id and public.is_trip_member(m.trip_id))
);
create policy "Allow users to delete own meal votes" on public.meal_votes for delete to authenticated using (auth.uid() = user_id);

-- Events
create policy "Allow authenticated users to read events" on public.events for select to authenticated using (public.is_trip_member(trip_id));
create policy "Allow authenticated users to insert events" on public.events for insert to authenticated with check (auth.uid() = user_id and public.is_trip_member(trip_id));
create policy "Allow authenticated users to update events" on public.events for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Allow authenticated users to delete events" on public.events for delete to authenticated using (public.is_trip_member(trip_id));

create policy "Allow authenticated users to read event attendees" on public.event_attendees for select to authenticated using (
  exists (select 1 from public.events e where e.id = event_attendees.event_id and public.is_trip_member(e.trip_id))
);
create policy "Allow authenticated users to attend events" on public.event_attendees for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.events e where e.id = event_attendees.event_id and public.is_trip_member(e.trip_id))
);
create policy "Allow users to remove attendance" on public.event_attendees for delete to authenticated using (auth.uid() = user_id);

-- Invitations are visible only to their invitee or trip members who can manage them.
create policy "Invitees and members can read trip invitations" on public.trip_invitations
  for select to authenticated using (
    invitee_user_id = auth.uid()
    or public.is_trip_member(trip_id)
  );
create policy "Trip members can create invitations" on public.trip_invitations
  for insert to authenticated with check (false);
create policy "Inviters and invitees can respond to invitations" on public.trip_invitations
  for update to authenticated using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
create policy "Inviters can cancel invitations" on public.trip_invitations
  for delete to authenticated using (false);

create policy "Trip members can read calls" on public.call_sessions
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "Trip members can create calls" on public.call_sessions
  for insert to authenticated with check (host_id = auth.uid() and public.is_trip_member(trip_id));
create policy "Trip members can update calls" on public.call_sessions
  for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy "Users can manage their push subscriptions" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their notification preferences" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage own active-trip state" on public.trip_user_activity
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));

grant execute on function public.create_trip_invitation(uuid, text) to authenticated;
grant execute on function public.respond_to_trip_invitation(uuid, boolean) to authenticated;

-- 15. AUTOMATIC NEW USER PROFILE TRIGGER
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_color text;
  v_palette text[] := array['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6', '#00C7BE', '#30B0C7'];
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    'Trip member'
  );
  v_color := v_palette[1 + (floor(random() * 8)::int % 8)];
  
  insert into public.profiles (id, display_name, color)
  values (new.id, v_display_name, v_color)
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, profiles.display_name);
  
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 16. INVITE CODE GENERATOR & RPCs
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text[] := '{A,B,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,U,V,W,X,Y,Z,2,3,4,5,6,7,8,9}';
  result text := '';
  i integer := 0;
begin
  for i in 1..6 loop
    result := result || chars[1 + floor(random() * array_length(chars, 1))::integer];
  end loop;
  return result;
end;
$$;

create or replace function public.create_trip(name text, start_date date, end_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_code text;
  v_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  loop
    v_code := public.generate_invite_code();
    select exists(select 1 from public.trips where invite_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;

  insert into public.trips (name, start_date, end_date, invite_code, owner_id)
  values (name, start_date, end_date, v_code, auth.uid())
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'owner')
  on conflict (trip_id, user_id) do nothing;

  return v_trip_id;
end;
$$;
grant execute on function public.create_trip(text, date, date) to authenticated;

create or replace function public.join_trip(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select id into v_trip_id
  from public.trips
  where upper(trim(invite_code)) = upper(trim(code));

  if v_trip_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'member')
  on conflict (trip_id, user_id) do nothing;

  return v_trip_id;
end;
$$;
grant execute on function public.join_trip(text) to authenticated;

create or replace function public.end_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll record;
  v_total_votes integer := 0;
  v_winner_text text := '';
  v_options_json jsonb;
  v_metadata jsonb;
  v_msg_id uuid;
  v_creator_name text := 'Creator';
begin
  select * into v_poll
  from public.polls
  where id = p_poll_id;

  if v_poll.id is null then
    raise exception 'Poll not found';
  end if;

  if v_poll.creator_id <> auth.uid() then
    raise exception 'Only the poll creator can end this poll';
  end if;

  update public.polls
  set is_closed = true
  where id = p_poll_id;

  select display_name into v_creator_name
  from public.profiles
  where id = auth.uid();

  with option_counts as (
    select
      o.id as option_id,
      o.text as option_text,
      count(v.id)::int as votes
    from public.poll_options o
    left join public.poll_votes v on v.option_id = o.id
    where o.poll_id = p_poll_id
    group by o.id, o.text, o.sort_order
    order by o.sort_order asc
  )
  select
    coalesce(sum(votes), 0),
    jsonb_agg(
      jsonb_build_object(
        'id', option_id,
        'text', option_text,
        'votes', votes
      )
    )
  into v_total_votes, v_options_json
  from option_counts;

  select option_text into v_winner_text
  from (
    select o.text as option_text, count(v.id)::int as votes
    from public.poll_options o
    left join public.poll_votes v on v.option_id = o.id
    where o.poll_id = p_poll_id
    group by o.id, o.text
    order by votes desc, o.id asc
    limit 1
  ) top_opt;

  v_metadata := jsonb_build_object(
    'poll_id', p_poll_id,
    'question', v_poll.question,
    'total_votes', v_total_votes,
    'winner', coalesce(v_winner_text, 'No votes'),
    'ended_by', coalesce(v_creator_name, 'Creator'),
    'options', coalesce(v_options_json, '[]'::jsonb)
  );

  insert into public.messages (trip_id, user_id, type, content, metadata)
  values (v_poll.trip_id, auth.uid(), 'poll_result', 'Poll Results: ' || v_poll.question, v_metadata)
  returning id into v_msg_id;

  return v_metadata;
end;
$$;
grant execute on function public.end_poll(uuid) to authenticated;

-- 17. ENABLE REALTIME BROADCASTING ON ALL TRIP TABLES
do $$
begin
  alter publication supabase_realtime add table public.messages;
  alter publication supabase_realtime add table public.reactions;
  alter publication supabase_realtime add table public.polls;
  alter publication supabase_realtime add table public.poll_options;
  alter publication supabase_realtime add table public.poll_votes;
  alter publication supabase_realtime add table public.grocery_items;
  alter publication supabase_realtime add table public.meals;
  alter publication supabase_realtime add table public.meal_votes;
  alter publication supabase_realtime add table public.events;
  alter publication supabase_realtime add table public.event_attendees;
  alter publication supabase_realtime add table public.trip_members;
  alter publication supabase_realtime add table public.trips;
  alter publication supabase_realtime add table public.profiles;
  alter publication supabase_realtime add table public.call_sessions;
exception
  when others then null;
end $$;

-- 18. AUTHORIZE PRIVATE REALTIME PRESENCE AND CALL CHANNELS
drop policy if exists "Trip members can receive private trip channels" on realtime.messages;
create policy "Trip members can receive private trip channels"
  on realtime.messages for select to authenticated
  using (
    exists (
      select 1
      from public.trip_members tm
      where tm.trip_id::text = split_part(realtime.topic(), ':', 2)
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Trip members can send private trip channels" on realtime.messages;
create policy "Trip members can send private trip channels"
  on realtime.messages for insert to authenticated
  with check (
    exists (
      select 1
      from public.trip_members tm
      where tm.trip_id::text = split_part(realtime.topic(), ':', 2)
        and tm.user_id = auth.uid()
    )
  );
