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
  current_drawer_index integer;
  next_word text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.creator_id <> auth.uid() then raise exception 'Only the game host can start a round'; end if;
  if g.status not in ('lobby', 'playing') or cardinality(g.players) < 2 then
    raise exception 'Invalid game state or not enough players';
  end if;

  if g.round_number = 0 then
    next_drawer := g.players[floor(random() * cardinality(g.players))::integer + 1];
  else
    current_drawer_index := array_position(g.players, g.drawer_id);
    if current_drawer_index is null then
      next_drawer := g.players[1];
    else
      next_drawer := g.players[(current_drawer_index % cardinality(g.players)) + 1];
    end if;
  end if;

  select word_english into next_word from public.draw_game_words order by random() limit 1;
  next_round := g.round_number + 1;
  update public.draw_games
    set status = 'playing', round_number = next_round, drawer_id = next_drawer,
        drawing = '[]'::jsonb, winner_id = null, updated_at = now()
    where id = p_game_id;
  insert into public.draw_game_round_secrets(game_id, round_number, drawer_id, word)
    values (p_game_id, next_round, next_drawer, next_word);
end;
$$;

revoke all on function public.start_draw_game_round(uuid) from public;
grant execute on function public.start_draw_game_round(uuid) to authenticated;
