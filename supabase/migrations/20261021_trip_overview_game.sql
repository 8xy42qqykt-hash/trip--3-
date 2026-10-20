begin;

create table if not exists public.trip_member_locations (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sharing boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  check (
    (sharing and latitude is not null and longitude is not null
      and latitude between -90 and 90 and longitude between -180 and 180)
    or (not sharing and latitude is null and longitude is null)
  )
);

create table if not exists public.trip_whereabouts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(message) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists trip_whereabouts_recent
  on public.trip_whereabouts (trip_id, created_at desc);

create table if not exists public.draw_games (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'finished', 'cancelled')),
  players uuid[] not null,
  participant_ids uuid[] not null default '{}',
  scores jsonb not null default '{}'::jsonb,
  round_number integer not null default 0,
  drawer_id uuid references public.profiles(id) on delete set null,
  drawing jsonb not null default '[]'::jsonb,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.draw_games
  add column if not exists participant_ids uuid[] not null default '{}';
update public.draw_games set participant_ids = players where cardinality(participant_ids) = 0;

alter table public.draw_games drop column if exists word;

create table if not exists public.draw_game_round_secrets (
  game_id uuid not null references public.draw_games(id) on delete cascade,
  round_number integer not null,
  drawer_id uuid not null references public.profiles(id) on delete cascade,
  word text not null check (length(word) between 1 and 40),
  primary key (game_id, round_number)
);

create table if not exists public.draw_game_guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.draw_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  guess text not null check (length(guess) between 1 and 200),
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.trip_member_locations enable row level security;
alter table public.trip_whereabouts enable row level security;
alter table public.draw_games enable row level security;
alter table public.draw_game_round_secrets enable row level security;
alter table public.draw_game_guesses enable row level security;

drop policy if exists "Trip members can see shared locations" on public.trip_member_locations;
create policy "Trip members can see shared locations" on public.trip_member_locations
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Users can share their own trip location" on public.trip_member_locations;
create policy "Users can share their own trip location" on public.trip_member_locations
  for insert to authenticated with check (user_id = auth.uid() and public.is_trip_member(trip_id));
drop policy if exists "Users can update their own trip location" on public.trip_member_locations;
create policy "Users can update their own trip location" on public.trip_member_locations
  for update to authenticated using (user_id = auth.uid() and public.is_trip_member(trip_id))
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));

drop policy if exists "Trip members can read whereabouts" on public.trip_whereabouts;
create policy "Trip members can read whereabouts" on public.trip_whereabouts
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Users can add their own whereabouts" on public.trip_whereabouts;
create policy "Users can add their own whereabouts" on public.trip_whereabouts
  for insert to authenticated with check (user_id = auth.uid() and public.is_trip_member(trip_id));

drop policy if exists "Trip members can read draw games" on public.draw_games;
create policy "Trip members can read draw games" on public.draw_games
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Trip members can create draw games" on public.draw_games;
create policy "Trip members can create draw games" on public.draw_games
  for insert to authenticated with check (creator_id = auth.uid() and public.is_trip_member(trip_id));
drop policy if exists "Game players can update draw games" on public.draw_games;
create policy "Game players can update draw games" on public.draw_games
  for update to authenticated using (
    public.is_trip_member(trip_id) and (creator_id = auth.uid() or auth.uid() = any(players))
  ) with check (
    public.is_trip_member(trip_id) and (creator_id = auth.uid() or auth.uid() = any(players))
  );

revoke update on public.draw_games from authenticated;

drop policy if exists "Only the drawer can read the round word" on public.draw_game_round_secrets;
create policy "Only the drawer can read the round word" on public.draw_game_round_secrets
  for select to authenticated using (drawer_id = auth.uid());

drop policy if exists "Trip members can read draw game guesses" on public.draw_game_guesses;
create policy "Trip members can read draw game guesses" on public.draw_game_guesses
  for select to authenticated using (
    exists (
      select 1 from public.draw_games g
      where g.id = game_id and public.is_trip_member(g.trip_id)
    )
  );
drop policy if exists "Players can add draw game guesses" on public.draw_game_guesses;
create policy "Players can add draw game guesses" on public.draw_game_guesses
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.draw_games g
      where g.id = game_id and public.is_trip_member(g.trip_id) and auth.uid() = any(g.players)
    )
  );

revoke insert on public.draw_game_guesses from authenticated;

create or replace function public.join_draw_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.status not in ('lobby', 'playing') then raise exception 'Game is no longer active'; end if;
  update public.draw_games
    set players = case when auth.uid() = any(g.players) then g.players else array_append(g.players, auth.uid()) end,
        participant_ids = case
          when auth.uid() = any(g.participant_ids) then g.participant_ids
          else array_append(g.participant_ids, auth.uid())
        end,
        updated_at = now()
    where id = p_game_id;
end;
$$;

create or replace function public.leave_draw_game(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
  remaining uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if not (auth.uid() = any(g.players)) then raise exception 'You are not in this game'; end if;
  remaining := array_remove(g.players, auth.uid());
  if cardinality(remaining) = 0 then
    update public.draw_games set players = remaining, status = 'finished', updated_at = now() where id = p_game_id;
    return true;
  end if;
  update public.draw_games
    set players = remaining,
        creator_id = case when g.creator_id = auth.uid() then remaining[1] else g.creator_id end,
        status = case
          when g.status = 'playing' and g.drawer_id = auth.uid() and g.winner_id is null then 'lobby'
          else g.status
        end,
        drawer_id = case
          when g.status = 'playing' and g.drawer_id = auth.uid() and g.winner_id is null then null
          else g.drawer_id
        end,
        drawing = case
          when g.status = 'playing' and g.drawer_id = auth.uid() and g.winner_id is null then '[]'::jsonb
          else g.drawing
        end,
        updated_at = now()
    where id = p_game_id;
  return false;
end;
$$;

create or replace function public.save_draw_game_drawing(p_game_id uuid, p_drawing jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.status <> 'playing' or g.drawer_id <> auth.uid() or g.winner_id is not null then
    raise exception 'Drawing is not available';
  end if;
  if p_drawing is null or jsonb_typeof(p_drawing) <> 'array' then raise exception 'Invalid drawing'; end if;
  update public.draw_games set drawing = p_drawing, updated_at = now() where id = p_game_id;
end;
$$;

create or replace function public.cancel_draw_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.creator_id <> auth.uid() or g.status <> 'lobby' then raise exception 'Only the host can cancel a lobby'; end if;
  update public.draw_games set status = 'cancelled', updated_at = now() where id = p_game_id;
end;
$$;

create or replace function public.finish_draw_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.creator_id <> auth.uid() or cardinality(g.players) >= 2 then
    raise exception 'The game cannot be finished yet';
  end if;
  update public.draw_games set status = 'finished', updated_at = now() where id = p_game_id;
end;
$$;

create or replace function public.start_draw_game_round(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
  next_round integer;
  next_drawer uuid;
  next_word text;
  words text[] := array[
    'airplane', 'banana', 'bicycle', 'campfire', 'castle', 'caterpillar', 'computer',
    'dolphin', 'fireworks', 'guitar', 'hamburger', 'island', 'jellyfish', 'lighthouse',
    'mountain', 'octopus', 'pancake', 'rainbow', 'snowman', 'watermelon'
  ];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.creator_id <> auth.uid() then raise exception 'Only the game host can start a round'; end if;
  if g.status not in ('lobby', 'playing') or cardinality(g.players) < 2 then
    raise exception 'Invalid game state or not enough players';
  end if;
  next_drawer := g.players[floor(random() * cardinality(g.players))::integer + 1];
  next_word := words[floor(random() * cardinality(words))::integer + 1];
  next_round := g.round_number + 1;
  update public.draw_games
    set status = 'playing', round_number = next_round, drawer_id = next_drawer,
        drawing = '[]'::jsonb, winner_id = null, updated_at = now()
    where id = p_game_id;
  insert into public.draw_game_round_secrets(game_id, round_number, drawer_id, word)
    values (p_game_id, next_round, next_drawer, next_word);
end;
$$;

create or replace function public.submit_draw_game_guess(p_game_id uuid, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
  secret_word text;
  is_correct boolean;
  next_score integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_guess)) not between 1 and 200 then raise exception 'Invalid guess'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) or not (auth.uid() = any(g.players)) then
    raise exception 'Game not found';
  end if;
  if g.status <> 'playing' or g.winner_id is not null or auth.uid() = g.drawer_id then
    raise exception 'Guessing is not available';
  end if;
  select word into secret_word
    from public.draw_game_round_secrets
    where game_id = p_game_id and round_number = g.round_number;
  is_correct := lower(trim(p_guess)) = lower(secret_word);
  insert into public.draw_game_guesses(game_id, user_id, guess, correct)
    values (p_game_id, auth.uid(), trim(p_guess), is_correct);
  if is_correct then
    next_score := coalesce((g.scores ->> auth.uid()::text)::integer, 0) + 1;
    update public.draw_games
      set winner_id = auth.uid(),
          scores = jsonb_set(g.scores, array[auth.uid()::text], to_jsonb(next_score), true),
          updated_at = now()
      where id = p_game_id;
  end if;
  return is_correct;
end;
$$;

revoke all on function public.join_draw_game(uuid) from public;
revoke all on function public.leave_draw_game(uuid) from public;
revoke all on function public.save_draw_game_drawing(uuid, jsonb) from public;
revoke all on function public.cancel_draw_game(uuid) from public;
revoke all on function public.finish_draw_game(uuid) from public;
revoke all on function public.start_draw_game_round(uuid) from public;
revoke all on function public.submit_draw_game_guess(uuid, text) from public;
grant execute on function public.join_draw_game(uuid) to authenticated;
grant execute on function public.leave_draw_game(uuid) to authenticated;
grant execute on function public.save_draw_game_drawing(uuid, jsonb) to authenticated;
grant execute on function public.cancel_draw_game(uuid) to authenticated;
grant execute on function public.finish_draw_game(uuid) to authenticated;
grant execute on function public.start_draw_game_round(uuid) to authenticated;
grant execute on function public.submit_draw_game_guess(uuid, text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['trip_member_locations', 'trip_whereabouts', 'draw_games', 'draw_game_guesses'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
       ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

commit;
