-- ====================================================================
-- TRIP APP: Complete Supabase Fresh Reset & Schema Installation
-- Run this entire script in Supabase SQL Editor (https://supabase.com)
-- ====================================================================

-- 1. DROP EXISTING TRIGGERS, FUNCTIONS, POLICIES & TABLES
drop trigger if exists on_auth_user_created on auth.users cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_trip_member(uuid) cascade;
drop function if exists public.generate_invite_code() cascade;
drop function if exists public.create_trip(text, date, date) cascade;
drop function if exists public.join_trip(text) cascade;
drop function if exists public.end_poll(uuid) cascade;

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

-- 2. CLEAR AND RECREATE STORAGE BUCKET
do $$
begin
  delete from storage.objects where bucket_id = 'trip-assets';
  delete from storage.buckets where id = 'trip-assets';
exception
  when others then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-assets', 'trip-assets', true, 52428800, null)
on conflict (id) do update set public = true;

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

-- 13. ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.grocery_items enable row level security;
alter table public.meals enable row level security;
alter table public.meal_votes enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

-- 14. CLEAN NON-RECURSIVE RLS POLICIES
-- Profiles
create policy "Allow all authenticated to read profiles" on public.profiles for select to authenticated using (true);
create policy "Allow users to update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Allow users to insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Trips
create policy "Allow authenticated users to read trips" on public.trips for select to authenticated using (true);
create policy "Allow authenticated users to create trips" on public.trips for insert to authenticated with check (auth.uid() = owner_id);
create policy "Allow owners to update trips" on public.trips for update to authenticated using (owner_id = auth.uid());
create policy "Allow owners to delete trips" on public.trips for delete to authenticated using (owner_id = auth.uid());

-- Trip Members
create policy "Allow authenticated users to read trip members" on public.trip_members for select to authenticated using (true);
create policy "Allow authenticated users to join trips" on public.trip_members for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow users to leave or owners to remove members" on public.trip_members for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_members.trip_id and t.owner_id = auth.uid())
);

-- Messages
create policy "Allow authenticated users to read messages" on public.messages for select to authenticated using (true);
create policy "Allow authenticated users to send messages" on public.messages for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow message authors to delete messages" on public.messages for delete to authenticated using (auth.uid() = user_id);

-- Reactions
create policy "Allow authenticated users to read reactions" on public.reactions for select to authenticated using (true);
create policy "Allow authenticated users to insert reactions" on public.reactions for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow users to delete own reactions" on public.reactions for delete to authenticated using (auth.uid() = user_id);

-- Polls, Options & Votes
create policy "Allow authenticated users to read polls" on public.polls for select to authenticated using (true);
create policy "Allow authenticated users to create polls" on public.polls for insert to authenticated with check (auth.uid() = creator_id);
create policy "Allow creators to update polls" on public.polls for update to authenticated using (creator_id = auth.uid());

create policy "Allow authenticated users to read poll options" on public.poll_options for select to authenticated using (true);
create policy "Allow authenticated users to insert poll options" on public.poll_options for insert to authenticated with check (true);

create policy "Allow authenticated users to read poll votes" on public.poll_votes for select to authenticated using (true);
create policy "Allow authenticated users to insert poll votes" on public.poll_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow users to delete own poll votes" on public.poll_votes for delete to authenticated using (auth.uid() = user_id);

-- Groceries
create policy "Allow authenticated users to read groceries" on public.grocery_items for select to authenticated using (true);
create policy "Allow authenticated users to insert groceries" on public.grocery_items for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow authenticated users to update groceries" on public.grocery_items for update to authenticated using (true);
create policy "Allow authenticated users to delete groceries" on public.grocery_items for delete to authenticated using (true);

-- Meals
create policy "Allow authenticated users to read meals" on public.meals for select to authenticated using (true);
create policy "Allow authenticated users to insert meals" on public.meals for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow authenticated users to update meals" on public.meals for update to authenticated using (true);
create policy "Allow authenticated users to delete meals" on public.meals for delete to authenticated using (true);

create policy "Allow authenticated users to read meal votes" on public.meal_votes for select to authenticated using (true);
create policy "Allow authenticated users to insert meal votes" on public.meal_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow users to delete own meal votes" on public.meal_votes for delete to authenticated using (auth.uid() = user_id);

-- Events
create policy "Allow authenticated users to read events" on public.events for select to authenticated using (true);
create policy "Allow authenticated users to insert events" on public.events for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow authenticated users to update events" on public.events for update to authenticated using (true);
create policy "Allow authenticated users to delete events" on public.events for delete to authenticated using (true);

create policy "Allow authenticated users to read event attendees" on public.event_attendees for select to authenticated using (true);
create policy "Allow authenticated users to attend events" on public.event_attendees for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow users to remove attendance" on public.event_attendees for delete to authenticated using (auth.uid() = user_id);

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
    split_part(new.email, '@', 1)
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
exception
  when others then null;
end $$;
