create extension if not exists fuzzystrmatch with schema extensions;

create table if not exists public.trip_game_sessions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null check (game_type in ('movie_trivia', 'connect_four', 'tic_tac_toe')),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'cancelled')),
  players uuid[] not null,
  participant_ids uuid[] not null,
  config jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_game_secrets (
  session_id uuid not null references public.trip_game_sessions(id) on delete cascade,
  round_number integer not null,
  answer text not null,
  primary key (session_id, round_number)
);

create table if not exists public.trip_game_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trip_game_sessions(id) on delete cascade,
  round_number integer not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer text not null,
  correct boolean not null,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists trip_game_sessions_trip_recent
  on public.trip_game_sessions (trip_id, created_at desc);
create index if not exists trip_game_answers_session_round
  on public.trip_game_answers (session_id, round_number, user_id);

alter table public.trip_game_sessions enable row level security;
alter table public.trip_game_secrets enable row level security;
alter table public.trip_game_answers enable row level security;
grant select on public.trip_game_sessions, public.trip_game_answers to authenticated;

drop policy if exists "Trip members can read game sessions" on public.trip_game_sessions;
create policy "Trip members can read game sessions" on public.trip_game_sessions
  for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "Players can read revealed game answers" on public.trip_game_answers;
create policy "Players can read revealed game answers" on public.trip_game_answers
  for select to authenticated using (
    user_id = auth.uid()
    or (correct and exists (
      select 1 from public.trip_game_sessions s
      where s.id = session_id and s.status in ('finished', 'cancelled')
        and public.is_trip_member(s.trip_id)
    ))
    or (correct and exists (
      select 1 from public.trip_game_sessions s
      where s.id = session_id
        and (s.state->>'round')::integer > round_number
        and public.is_trip_member(s.trip_id)
    ))
  );

create or replace function public.create_trip_game_session(
  p_trip_id uuid,
  p_game_type text,
  p_config jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.is_trip_member(p_trip_id) then raise exception 'Trip not found'; end if;
  if p_game_type not in ('movie_trivia', 'connect_four', 'tic_tac_toe') then raise exception 'Unsupported game'; end if;
  if exists (
    select 1 from public.trip_game_sessions
    where status in ('lobby', 'playing') and auth.uid() = any(players)
  ) or exists (
    select 1 from public.draw_games
    where status in ('lobby', 'playing') and auth.uid() = any(players)
  ) then raise exception 'Leave your active game before creating another'; end if;

  insert into public.trip_game_sessions (
    trip_id, creator_id, host_id, game_type, players, participant_ids, config
  ) values (
    p_trip_id, auth.uid(), auth.uid(), p_game_type, array[auth.uid()], array[auth.uid()],
    coalesce(p_config, '{}'::jsonb)
  ) returning id into v_session_id;
  return v_session_id;
end;
$$;

create or replace function public.create_trip_draw_game(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.is_trip_member(p_trip_id) then raise exception 'Trip not found'; end if;
  if exists (
    select 1 from public.trip_game_sessions
    where status in ('lobby', 'playing') and auth.uid() = any(players)
  ) or exists (
    select 1 from public.draw_games
    where status in ('lobby', 'playing') and auth.uid() = any(players)
  ) then raise exception 'Leave your active game before creating another'; end if;
  insert into public.draw_games (
    trip_id, creator_id, status, players, participant_ids, scores, drawing
  ) values (p_trip_id, auth.uid(), 'lobby', array[auth.uid()], array[auth.uid()], '{}'::jsonb, '[]'::jsonb)
  returning id into v_game_id;
  return v_game_id;
end;
$$;

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
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.status not in ('lobby', 'playing') then raise exception 'Game is no longer active'; end if;
  if not auth.uid() = any(g.players) and (
    exists (select 1 from public.trip_game_sessions where status in ('lobby', 'playing') and auth.uid() = any(players))
    or exists (select 1 from public.draw_games other where other.id <> g.id and other.status in ('lobby', 'playing') and auth.uid() = any(other.players))
  ) then raise exception 'You are already in another active game'; end if;
  update public.draw_games
    set players = case when auth.uid() = any(g.players) then g.players else array_append(g.players, auth.uid()) end,
        participant_ids = case when auth.uid() = any(g.participant_ids) then g.participant_ids else array_append(g.participant_ids, auth.uid()) end,
        updated_at = now()
    where id = p_game_id;
end;
$$;

create or replace function public.update_trip_game_config(p_session_id uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.trip_game_sessions%rowtype;
  v_rounds integer;
  v_time_limit integer;
  v_best_of integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if not found or s.host_id <> auth.uid() or s.status <> 'lobby' then raise exception 'Only the host can change lobby settings'; end if;
  if s.game_type = 'movie_trivia' then
    v_rounds := coalesce((p_config->>'rounds')::integer, 5);
    v_time_limit := coalesce((p_config->>'timeLimit')::integer, 30);
    if v_rounds not in (5, 10, 15) or v_time_limit not in (15, 30, 45) then raise exception 'Invalid trivia settings'; end if;
    update public.trip_game_sessions set config = jsonb_build_object('rounds', v_rounds, 'timeLimit', v_time_limit), updated_at = now() where id = s.id;
  elsif s.game_type = 'tic_tac_toe' then
    v_best_of := coalesce((p_config->>'bestOf')::integer, 1);
    if v_best_of not in (1, 3) then raise exception 'Invalid match settings'; end if;
    update public.trip_game_sessions set config = jsonb_build_object('bestOf', v_best_of), updated_at = now() where id = s.id;
  end if;
end;
$$;

create or replace function public.join_trip_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.trip_game_sessions%rowtype;
  v_max_players integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if not found or not public.is_trip_member(s.trip_id) then raise exception 'Game not found'; end if;
  if s.status <> 'lobby' then raise exception 'This game is no longer accepting players'; end if;
  if auth.uid() = any(s.players) then return; end if;
  if exists (
    select 1 from public.trip_game_sessions
    where id <> p_session_id and status in ('lobby', 'playing') and auth.uid() = any(players)
  ) or exists (
    select 1 from public.draw_games
    where status in ('lobby', 'playing') and auth.uid() = any(players)
  ) then raise exception 'You are already in another active game'; end if;

  v_max_players := case when s.game_type in ('connect_four', 'tic_tac_toe') then 2 else null end;
  if v_max_players is not null and cardinality(s.players) >= v_max_players then
    raise exception 'This game is already full';
  end if;
  update public.trip_game_sessions
  set players = array_append(s.players, auth.uid()),
      participant_ids = case when auth.uid() = any(s.participant_ids)
        then s.participant_ids else array_append(s.participant_ids, auth.uid()) end,
      updated_at = now()
  where id = p_session_id;
end;
$$;

create or replace function public.leave_trip_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.trip_game_sessions%rowtype;
  v_remaining uuid[];
  v_winner uuid;
  v_creator uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if not found or not auth.uid() = any(s.players) then return; end if;
  select coalesce(array_agg(player), '{}'::uuid[]) into v_remaining
    from unnest(s.players) as player where player <> auth.uid();
  v_creator := case when s.host_id = auth.uid() and cardinality(v_remaining) > 0
    then v_remaining[1] else s.host_id end;
  if s.status = 'playing' and s.game_type in ('connect_four', 'tic_tac_toe')
     and cardinality(v_remaining) = 1 then
    v_winner := v_remaining[1];
    update public.trip_game_sessions
      set players = v_remaining, host_id = v_creator, status = 'finished', winner_id = v_winner, updated_at = now()
      where id = p_session_id;
  else
    update public.trip_game_sessions
      set players = v_remaining,
          host_id = v_creator,
          status = case when cardinality(v_remaining) = 0 then 'cancelled' else status end,
          updated_at = now()
      where id = p_session_id;
  end if;
end;
$$;

create table if not exists public.trip_movie_trivia_questions (
  id integer generated always as identity primary key,
  prompt text not null,
  answer text not null
);

insert into public.trip_movie_trivia_questions (prompt, answer)
select q.prompt, q.answer from (values
  ('Which animated movie features the song “Let It Go”?', 'Frozen'),
  ('What is the name of the cowboy in Toy Story?', 'Woody'),
  ('Which movie features a young wizard named Harry?', 'Harry Potter'),
  ('Which 1994 animated movie follows a lion cub named Simba?', 'The Lion King'),
  ('Who directed Jurassic Park?', 'Steven Spielberg'),
  ('In Back to the Future, what year does Marty first travel to?', '1955'),
  ('Which movie features the quote “May the Force be with you”?', 'Star Wars'),
  ('What is the name of the kingdom in Black Panther?', 'Wakanda'),
  ('Which 1993 film features dinosaurs cloned from ancient DNA?', 'Jurassic Park'),
  ('Which Pixar movie is set inside the mind of a young girl?', 'Inside Out'),
  ('Which actor played Jack in Titanic?', 'Leonardo DiCaprio'),
  ('What is the name of the hobbit played by Elijah Wood?', 'Frodo'),
  ('Which movie features a house lifted by balloons?', 'Up'),
  ('Who is the main character in the 1984 film The Terminator?', 'Sarah Connor'),
  ('Which movie includes the characters Shrek and Donkey?', 'Shrek'),
  ('In Finding Nemo, what kind of fish is Dory?', 'Blue tang'),
  ('Which 2001 fantasy film begins with a trip to Mordor?', 'The Lord of the Rings'),
  ('Which movie has a magical nanny played by Julie Andrews?', 'Mary Poppins'),
  ('Which superhero is also known as the Dark Knight?', 'Batman'),
  ('Which 1982 science-fiction film features an alien called E.T.?', 'E.T. the Extra-Terrestrial')
) as q(prompt, answer)
where not exists (
  select 1 from public.trip_movie_trivia_questions existing where existing.prompt = q.prompt
);

create or replace function public.enqueue_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_trip_id uuid;
  v_actor_id uuid;
  v_recipient_id uuid;
  v_category text := 'messages';
  v_preview text := 'There is an update in your trip.';
  v_destination text;
  v_high_priority boolean := false;
  v_message_type text;
  v_game_id text;
begin
  if tg_table_name = 'trip_invitations' and tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
  end if;
  v_actor_id := coalesce(auth.uid(), nullif(v_row->>'user_id', '')::uuid,
    nullif(v_row->>'creator_id', '')::uuid, nullif(v_row->>'host_id', '')::uuid,
    nullif(v_row->>'inviter_id', '')::uuid);
  if tg_table_name = 'messages' then
    v_trip_id := (v_row->>'trip_id')::uuid;
    v_message_type := v_row->>'type';
    if v_message_type = 'call' then return new; end if;
    if v_message_type in ('draw_game', 'game_session') then
      v_category := 'games';
      v_preview := case when v_message_type = 'draw_game' then 'Started Draw and Guess' else 'Started a game' end;
      v_game_id := case when v_message_type = 'draw_game'
        then v_row->'metadata'->>'gameId' else v_row->'metadata'->>'gameSessionId' end;
      v_destination := '/?trip=' || v_trip_id || '&view=games&'
        || case when v_message_type = 'draw_game' then 'drawGameId=' else 'gameSessionId=' end
        || coalesce(v_game_id, '');
      v_high_priority := true;
    else
      v_category := case when v_message_type = 'poll_result' then 'polls' else 'messages' end;
      v_preview := case
        when tg_op = 'UPDATE' and v_message_type = 'grocery_list' then 'Updated a grocery list'
        when tg_op = 'UPDATE' and v_message_type = 'meal' then 'Updated a meal'
        when tg_op = 'UPDATE' and v_message_type = 'plan' then 'Updated a plan'
        when tg_op = 'UPDATE' then 'Edited a message'
        when v_message_type = 'image' then 'Sent a photo'
        when v_message_type = 'grocery_list' then 'Sent a grocery list'
        when v_message_type = 'meal' then 'Added a meal'
        when v_message_type = 'plan' then 'Added a plan'
        when v_message_type = 'poll_result' then 'Poll results are ready'
        else left(coalesce(v_row->>'content', 'Sent a message'), 120) end;
    end if;
  elsif tg_table_name in ('grocery_items', 'meals', 'events', 'polls') then
    v_trip_id := (v_row->>'trip_id')::uuid;
    v_category := case when tg_table_name = 'polls' then 'polls' else 'messages' end;
    v_preview := case tg_table_name
      when 'grocery_items' then 'Updated the grocery list'
      when 'meals' then 'Added or updated a meal'
      when 'events' then 'Added or updated a plan'
      else 'Created a poll' end;
  elsif tg_table_name = 'trips' then
    v_trip_id := (v_row->>'id')::uuid;
    v_category := 'trip_updates';
    v_preview := 'Updated trip details';
  elsif tg_table_name = 'reactions' then
    select trip_id into v_trip_id from public.messages where id = (v_row->>'message_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'reactions'; v_preview := 'Reacted to a message';
  elsif tg_table_name = 'poll_votes' then
    select p.trip_id into v_trip_id from public.poll_options o
      join public.polls p on p.id = o.poll_id where o.id = (v_row->>'option_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_category := 'polls'; v_preview := 'Voted in a poll';
  elsif tg_table_name = 'meal_votes' then
    select trip_id into v_trip_id from public.meals where id = (v_row->>'meal_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_preview := 'Liked a meal';
  elsif tg_table_name = 'event_attendees' then
    select trip_id into v_trip_id from public.events where id = (v_row->>'event_id')::uuid;
    v_actor_id := coalesce(auth.uid(), (v_row->>'user_id')::uuid);
    v_preview := 'Updated plan attendance';
  elsif tg_table_name = 'trip_invitations' then
    v_trip_id := (v_row->>'trip_id')::uuid;
    v_category := 'invitations';
    if tg_op = 'INSERT' then
      v_actor_id := (v_row->>'inviter_id')::uuid;
      v_recipient_id := nullif(v_row->>'invitee_user_id', '')::uuid;
      v_preview := 'Invited you to join a trip';
      v_destination := '/?invitation=' || (v_row->>'id');
    else
      v_actor_id := coalesce(auth.uid(), (v_row->>'invitee_user_id')::uuid);
      v_recipient_id := (v_row->>'inviter_id')::uuid;
      v_preview := case v_row->>'status'
        when 'accepted' then 'Accepted your trip invitation'
        when 'rejected' then 'Declined your trip invitation'
        else 'Updated a trip invitation' end;
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
  if v_destination is null then v_destination := '/?trip=' || v_trip_id || '&view=messages'; end if;
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
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

alter table public.trip_movie_trivia_questions enable row level security;
revoke all on public.trip_movie_trivia_questions from anon, authenticated;
revoke all on public.trip_game_secrets from anon, authenticated;
revoke insert, update, delete on public.trip_game_sessions from anon, authenticated;
revoke insert, update, delete on public.trip_game_answers from anon, authenticated;

create or replace function public.start_trip_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.trip_game_sessions%rowtype;
  q public.trip_movie_trivia_questions%rowtype;
  v_rounds integer;
  v_time_limit integer;
  v_board jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if not found or s.host_id <> auth.uid() or s.status <> 'lobby' then raise exception 'Only the host can start this lobby'; end if;
  if not public.is_trip_member(s.trip_id) then raise exception 'Trip not found'; end if;
  if cardinality(s.players) < 2 then raise exception 'At least two players are required'; end if;
  if s.game_type in ('connect_four', 'tic_tac_toe') and cardinality(s.players) <> 2 then
    raise exception 'This game requires exactly two players';
  end if;

  if s.game_type = 'movie_trivia' then
    v_rounds := coalesce((s.config->>'rounds')::integer, 5);
    v_time_limit := coalesce((s.config->>'timeLimit')::integer, 30);
    if v_rounds not in (5, 10, 15) or v_time_limit not in (15, 30, 45) then
      raise exception 'Invalid trivia settings';
    end if;
    select * into q from public.trip_movie_trivia_questions order by random() limit 1;
    insert into public.trip_game_secrets(session_id, round_number, answer) values (s.id, 1, q.answer);
    update public.trip_game_sessions set status = 'playing',
      state = jsonb_build_object('round', 1, 'rounds', v_rounds, 'timeLimit', v_time_limit,
        'prompt', q.prompt, 'roundStartedAt', now(), 'scores', '{}'::jsonb, 'revealedAnswer', null, 'correctUsers', '[]'::jsonb),
      updated_at = now() where id = s.id;
  elsif s.game_type = 'connect_four' then
    v_board := jsonb_build_array(
      jsonb_build_array(null,null,null,null,null,null,null), jsonb_build_array(null,null,null,null,null,null,null),
      jsonb_build_array(null,null,null,null,null,null,null), jsonb_build_array(null,null,null,null,null,null,null),
      jsonb_build_array(null,null,null,null,null,null,null), jsonb_build_array(null,null,null,null,null,null,null)
    );
    update public.trip_game_sessions set status = 'playing',
      state = jsonb_build_object('board', v_board, 'moveCount', 0, 'winningLine', '[]'::jsonb),
      updated_at = now() where id = s.id;
  else
    update public.trip_game_sessions set status = 'playing',
      state = jsonb_build_object('board', jsonb_build_array(null,null,null,null,null,null,null,null,null),
        'moveCount', 0, 'winningLine', '[]'::jsonb, 'bestOf', coalesce((s.config->>'bestOf')::integer, 1),
        'wins', '{}'::jsonb),
      updated_at = now() where id = s.id;
  end if;
end;
$$;

create or replace function public.play_trip_game_move(p_session_id uuid, p_position integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.trip_game_sessions%rowtype;
  b jsonb;
  v_state jsonb;
  v_row integer;
  v_col integer;
  v_player_index integer;
  v_token text;
  v_r integer;
  v_c integer;
  v_dr integer;
  v_dc integer;
  v_count integer;
  v_line jsonb;
  v_winner uuid;
  v_move_count integer;
  v_full boolean;
  v_direction record;
  v_start integer;
  v_step integer;
  v_candidate_line jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if not found or not public.is_trip_member(s.trip_id) or s.status <> 'playing' then raise exception 'Game is not in progress'; end if;
  if not auth.uid() = any(s.players) then raise exception 'Join this game first'; end if;
  v_state := s.state;
  v_move_count := coalesce((v_state->>'moveCount')::integer, 0);
  v_player_index := mod(v_move_count, 2);
  if s.players[v_player_index + 1] <> auth.uid() then raise exception 'It is not your turn'; end if;
  v_token := case when v_player_index = 0 then 'X' else 'O' end;
  b := v_state->'board';

  if s.game_type = 'tic_tac_toe' then
    if p_position < 0 or p_position > 8 or b->p_position is distinct from 'null'::jsonb then raise exception 'That square is not available'; end if;
    b := jsonb_set(b, array[p_position::text], to_jsonb(v_token), false);
    v_row := p_position / 3;
    v_col := mod(p_position, 3);
    v_line := '[]'::jsonb;
    for v_direction in select * from (values (0,1),(1,0),(1,1),(1,-1)) directions(dr,dc) loop
      for v_start in -2..0 loop
        v_count := 0;
        v_candidate_line := '[]'::jsonb;
        for v_step in 0..2 loop
          v_r := v_row + v_direction.dr * (v_start + v_step);
          v_c := v_col + v_direction.dc * (v_start + v_step);
          if v_r between 0 and 2 and v_c between 0 and 2
            and b->(v_r * 3 + v_c) = to_jsonb(v_token) then
            v_count := v_count + 1;
            v_candidate_line := v_candidate_line || jsonb_build_array(jsonb_build_array(v_r, v_c));
          end if;
        end loop;
        if v_count = 3 then v_line := v_candidate_line; exit; end if;
      end loop;
      if jsonb_array_length(v_line) = 3 then exit; end if;
    end loop;
    if jsonb_array_length(v_line) = 3 then v_winner := auth.uid(); end if;
  elsif s.game_type = 'connect_four' then
    if p_position < 0 or p_position > 6 then raise exception 'Choose a valid column'; end if;
    v_row := -1;
    for v_r in reverse 5..0 loop
      if b->v_r->p_position = 'null'::jsonb then v_row := v_r; exit; end if;
    end loop;
    if v_row < 0 then raise exception 'That column is full'; end if;
    b := jsonb_set(b, array[v_row::text, p_position::text], to_jsonb(v_token), false);
    v_line := '[]'::jsonb;
    v_line := '[]'::jsonb;
    for v_direction in select * from (values (0,1),(1,0),(1,1),(1,-1)) directions(dr,dc) loop
      for v_start in -3..0 loop
        v_count := 0;
        v_candidate_line := '[]'::jsonb;
        for v_step in 0..3 loop
          v_r := v_row + v_direction.dr * (v_start + v_step);
          v_c := p_position + v_direction.dc * (v_start + v_step);
          if v_r between 0 and 5 and v_c between 0 and 6
            and b->v_r->v_c = to_jsonb(v_token) then
            v_count := v_count + 1;
            v_candidate_line := v_candidate_line || jsonb_build_array(jsonb_build_array(v_r, v_c));
          end if;
        end loop;
        if v_count = 4 then v_line := v_candidate_line; exit; end if;
      end loop;
      if jsonb_array_length(v_line) = 4 then exit; end if;
    end loop;
    if jsonb_array_length(v_line) >= 4 then v_winner := auth.uid(); else v_line := '[]'::jsonb; end if;
  else
    raise exception 'This game does not use board moves';
  end if;

  v_move_count := v_move_count + 1;
  v_full := v_move_count >= case when s.game_type = 'tic_tac_toe' then 9 else 42 end;
  update public.trip_game_sessions set
    state = jsonb_set(jsonb_set(jsonb_set(v_state, '{board}', b), '{moveCount}', to_jsonb(v_move_count)),
      '{winningLine}', v_line),
    status = case when v_winner is not null or v_full then 'finished' else 'playing' end,
    winner_id = v_winner,
    updated_at = now()
  where id = s.id;
  return jsonb_build_object('status', case when v_winner is not null or v_full then 'finished' else 'playing' end,
    'winnerId', v_winner, 'winningLine', v_line, 'draw', v_full and v_winner is null);
end;
$$;

create or replace function public.submit_trip_trivia_answer(p_session_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.trip_game_sessions%rowtype;
  v_round integer;
  v_limit integer;
  v_answer text;
  v_correct boolean;
  v_elapsed numeric;
  v_points integer := 0;
  v_normalized text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_answer is null or length(trim(p_answer)) not between 1 and 200 then raise exception 'Enter an answer first'; end if;
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if not found or s.status <> 'playing' or s.game_type <> 'movie_trivia'
     or not auth.uid() = any(s.players) or not public.is_trip_member(s.trip_id) then
    raise exception 'This trivia round is not accepting answers';
  end if;
  v_round := (s.state->>'round')::integer;
  v_limit := (s.state->>'timeLimit')::integer;
  select answer into v_answer from public.trip_game_secrets where session_id = s.id and round_number = v_round;
  v_normalized := lower(regexp_replace(trim(p_answer), '\s+', ' ', 'g'));
  v_correct := levenshtein_less_equal(v_normalized, regexp_replace(lower(trim(v_answer)), '\s+', ' ', 'g'), 2) <= 2;
  v_elapsed := extract(epoch from (now() - (s.state->>'roundStartedAt')::timestamptz));
  if v_elapsed > v_limit then raise exception 'Time is up for this round'; end if;
  if v_correct and exists (
    select 1 from public.trip_game_answers
    where session_id = s.id and round_number = v_round and user_id = auth.uid() and correct
  ) then raise exception 'You already answered this round correctly'; end if;
  if v_correct then v_points := 100 + greatest(0, floor((v_limit - v_elapsed) * 100 / v_limit)::integer); end if;
  insert into public.trip_game_answers(session_id, round_number, user_id, answer, correct, points)
  values (s.id, v_round, auth.uid(), trim(p_answer), v_correct, v_points);
  return jsonb_build_object('correct', v_correct, 'points', v_points);
end;
$$;

create or replace function public.advance_trip_trivia_round(p_session_id uuid, p_expected_round integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.trip_game_sessions%rowtype;
  v_round integer;
  v_next integer;
  v_question public.trip_movie_trivia_questions%rowtype;
  v_answer text;
  v_correct_users jsonb;
  v_scores jsonb;
  v_score record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.trip_game_sessions where id = p_session_id for update;
  if found and s.status = 'finished' and s.game_type = 'movie_trivia' then return; end if;
  if not found or s.status <> 'playing' or s.game_type <> 'movie_trivia'
     or not auth.uid() = any(s.players) or not public.is_trip_member(s.trip_id) then
    raise exception 'Only an active player can advance this trivia game';
  end if;
  v_round := (s.state->>'round')::integer;
  if v_round <> p_expected_round then return; end if;
  if now() < (s.state->>'roundStartedAt')::timestamptz + ((s.state->>'timeLimit')::integer * interval '1 second') then
    raise exception 'This round is still in progress';
  end if;
  select answer into v_answer from public.trip_game_secrets where session_id = s.id and round_number = v_round;
  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'points', points)), '[]'::jsonb)
    into v_correct_users from public.trip_game_answers
    where session_id = s.id and round_number = v_round and correct;
  v_scores := coalesce(s.state->'scores', '{}'::jsonb);
  for v_score in
    select user_id, sum(points)::integer as points
    from public.trip_game_answers
    where session_id = s.id and round_number = v_round and correct
    group by user_id
  loop
    v_scores := jsonb_set(v_scores, array[v_score.user_id::text],
      to_jsonb(coalesce((v_scores->>v_score.user_id::text)::integer, 0) + v_score.points), true);
  end loop;
  v_next := v_round + 1;
  if v_next > (s.state->>'rounds')::integer then
    update public.trip_game_sessions set status = 'finished', state = s.state || jsonb_build_object(
      'scores', v_scores, 'revealedAnswer', v_answer, 'correctUsers', v_correct_users, 'roundEnded', true
    ), winner_id = (
      select (key)::uuid from jsonb_each_text(v_scores) order by value::integer desc limit 1
    ), updated_at = now() where id = s.id;
    return;
  end if;
  select * into v_question from public.trip_movie_trivia_questions
    where id not in (select q.id from public.trip_movie_trivia_questions q join public.trip_game_secrets secret on secret.answer = q.answer where secret.session_id = s.id)
    order by random() limit 1;
  if v_question.id is null then select * into v_question from public.trip_movie_trivia_questions order by random() limit 1; end if;
  insert into public.trip_game_secrets(session_id, round_number, answer) values (s.id, v_next, v_question.answer);
  update public.trip_game_sessions set state = jsonb_build_object(
    'round', v_next, 'rounds', s.state->'rounds', 'timeLimit', s.state->'timeLimit',
    'prompt', v_question.prompt, 'roundStartedAt', now(), 'scores', v_scores,
    'revealedAnswer', v_answer, 'correctUsers', v_correct_users
  ), updated_at = now() where id = s.id;
end;
$$;

revoke all on function public.create_trip_game_session(uuid, text, jsonb) from public;
revoke all on function public.create_trip_draw_game(uuid) from public;
revoke all on function public.join_draw_game(uuid) from public;
revoke all on function public.update_trip_game_config(uuid, jsonb) from public;
revoke all on function public.join_trip_game_session(uuid) from public;
revoke all on function public.leave_trip_game_session(uuid) from public;
revoke all on function public.start_trip_game_session(uuid) from public;
revoke all on function public.play_trip_game_move(uuid, integer) from public;
revoke all on function public.submit_trip_trivia_answer(uuid, text) from public;
revoke all on function public.advance_trip_trivia_round(uuid, integer) from public;
grant execute on function public.create_trip_game_session(uuid, text, jsonb) to authenticated;
grant execute on function public.create_trip_draw_game(uuid) to authenticated;
grant execute on function public.join_draw_game(uuid) to authenticated;
grant execute on function public.update_trip_game_config(uuid, jsonb) to authenticated;
grant execute on function public.join_trip_game_session(uuid) to authenticated;
grant execute on function public.leave_trip_game_session(uuid) to authenticated;
grant execute on function public.start_trip_game_session(uuid) to authenticated;
grant execute on function public.play_trip_game_move(uuid, integer) to authenticated;
grant execute on function public.submit_trip_trivia_answer(uuid, text) to authenticated;
grant execute on function public.advance_trip_trivia_round(uuid, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_game_sessions'
     ) then
    execute 'alter publication supabase_realtime add table public.trip_game_sessions';
  end if;
end $$;
