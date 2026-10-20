create table if not exists public.draw_game_words (
  word_english text primary key,
  word_finnish text not null unique
);

insert into public.draw_game_words (word_finnish, word_english) values
  ('Omena', 'Apple'), ('Banaani', 'Banana'), ('Pizza', 'Pizza'), ('Hampurilainen', 'Burger'),
  ('Jäätelö', 'Ice cream'), ('Kakku', 'Cake'), ('Voileipä', 'Sandwich'), ('Porkkana', 'Carrot'),
  ('Vesimeloni', 'Watermelon'), ('Keksi', 'Cookie'), ('Koira', 'Dog'), ('Kissa', 'Cat'),
  ('Kani', 'Rabbit'), ('Hevonen', 'Horse'), ('Lehmä', 'Cow'), ('Sika', 'Pig'),
  ('Lammas', 'Sheep'), ('Kana', 'Chicken'), ('Ankka', 'Duck'), ('Sammakko', 'Frog'),
  ('Kilpikonna', 'Turtle'), ('Käärme', 'Snake'), ('Lintu', 'Bird'), ('Perhonen', 'Butterfly'),
  ('Mehiläinen', 'Bee'), ('Hämähäkki', 'Spider'), ('Norsu', 'Elephant'), ('Kirahvi', 'Giraffe'),
  ('Apina', 'Monkey'), ('Leijona', 'Lion'), ('Karhu', 'Bear'), ('Pingviini', 'Penguin'),
  ('Hai', 'Shark'), ('Valas', 'Whale'), ('Mustekala', 'Octopus'), ('Rapu', 'Crab'),
  ('Delfiini', 'Dolphin'), ('Aurinko', 'Sun'), ('Kuu', 'Moon'), ('Tähti', 'Star'),
  ('Pilvi', 'Cloud'), ('Sateenkaari', 'Rainbow'), ('Lumiukko', 'Snowman'), ('Puu', 'Tree'),
  ('Kukka', 'Flower'), ('Sieni', 'Mushroom'), ('Kaktus', 'Cactus'), ('Vuori', 'Mountain'),
  ('Ranta', 'Beach'), ('Tulivuori', 'Volcano'), ('Talo', 'House'), ('Linna', 'Castle'),
  ('Koulu', 'School'), ('Sairaala', 'Hospital'), ('Kauppa', 'Shop'), ('Bussi', 'Bus'),
  ('Auto', 'Car'), ('Polkupyörä', 'Bicycle'), ('Juna', 'Train'), ('Lentokone', 'Airplane'),
  ('Vene', 'Boat'), ('Raketti', 'Rocket'), ('Helikopteri', 'Helicopter'), ('Rullalauta', 'Skateboard'),
  ('Potkulauta', 'Scooter'), ('Pallo', 'Ball'), ('Leija', 'Kite'), ('Ilmapallo', 'Balloon'),
  ('Nalle', 'Teddy bear'), ('Nukke', 'Doll'), ('Robotti', 'Robot'), ('Hirviö', 'Monster'),
  ('Kummitus', 'Ghost'), ('Merirosvo', 'Pirate'), ('Supersankari', 'Superhero'), ('Kruunu', 'Crown'),
  ('Hattu', 'Hat'), ('Kenkä', 'Shoe'), ('Sukka', 'Sock'), ('Silmälasit', 'Glasses'),
  ('Sateenvarjo', 'Umbrella'), ('Reppu', 'Backpack'), ('Matkalaukku', 'Suitcase'), ('Kirja', 'Book'),
  ('Lyijykynä', 'Pencil'), ('Puhelin', 'Phone'), ('Kamera', 'Camera'), ('Tietokone', 'Computer'),
  ('Kello', 'Clock'), ('Avain', 'Key'), ('Lamppu', 'Lamp'), ('Tuoli', 'Chair'),
  ('Pöytä', 'Table'), ('Sänky', 'Bed'), ('Hammasharja', 'Toothbrush'), ('Kitara', 'Guitar'),
  ('Rumpu', 'Drum'), ('Jalkapallo', 'Football'), ('Lumihiutale', 'Snowflake'), ('Rannekello', 'Watch')
on conflict (word_english) do update set word_finnish = excluded.word_finnish;

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into g from public.draw_games where id = p_game_id for update;
  if not found or not public.is_trip_member(g.trip_id) then raise exception 'Game not found'; end if;
  if g.creator_id <> auth.uid() then raise exception 'Only the game host can start a round'; end if;
  if g.status not in ('lobby', 'playing') or cardinality(g.players) < 2 then
    raise exception 'Invalid game state or not enough players';
  end if;
  next_drawer := g.players[floor(random() * cardinality(g.players))::integer + 1];
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

create or replace function public.submit_draw_game_guess(p_game_id uuid, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.draw_games%rowtype;
  secret_word text;
  finnish_word text;
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
  select word_finnish into finnish_word
    from public.draw_game_words
    where lower(word_english) = lower(secret_word);
  is_correct := lower(trim(p_guess)) in (lower(secret_word), lower(finnish_word));
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

revoke all on function public.start_draw_game_round(uuid) from public;
revoke all on function public.submit_draw_game_guess(uuid, text) from public;
grant execute on function public.start_draw_game_round(uuid) to authenticated;
grant execute on function public.submit_draw_game_guess(uuid, text) to authenticated;
