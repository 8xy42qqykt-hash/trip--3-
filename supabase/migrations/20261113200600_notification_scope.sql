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
  v_category text;
  v_preview text;
  v_destination text;
  v_high_priority boolean := false;
  v_message_type text;
  v_game_id text;
begin
  if tg_op <> 'INSERT' or tg_table_name not in ('messages', 'call_sessions') then
    return new;
  end if;

  v_row := to_jsonb(new);
  v_trip_id := nullif(v_row->>'trip_id', '')::uuid;
  v_actor_id := coalesce(
    auth.uid(),
    nullif(v_row->>'user_id', '')::uuid,
    nullif(v_row->>'host_id', '')::uuid
  );

  if tg_table_name = 'messages' then
    v_message_type := v_row->>'type';
    if v_message_type in ('draw_game', 'game_session') then
      v_category := 'games';
      v_preview := case when v_message_type = 'draw_game' then 'Started Draw and Guess' else 'Started a game' end;
      v_game_id := case when v_message_type = 'draw_game'
        then v_row->'metadata'->>'gameId' else v_row->'metadata'->>'gameSessionId' end;
      v_destination := '/?trip=' || v_trip_id || '&view=games&'
        || case when v_message_type = 'draw_game' then 'drawGameId=' else 'gameSessionId=' end
        || coalesce(v_game_id, '');
      v_high_priority := true;
    elsif v_message_type in ('text', 'image', 'video') then
      v_category := 'messages';
      v_preview := case v_message_type
        when 'image' then 'Sent a photo'
        when 'video' then 'Sent a video'
        else left(coalesce(nullif(v_row->>'content', ''), 'Sent a message'), 120)
      end;
    else
      return new;
    end if;
  else
    v_category := 'calls';
    v_preview := case when v_row->>'kind' = 'video' then 'Started a video call' else 'Started a voice call' end;
    v_destination := '/?trip=' || v_trip_id || '&view=messages&call=' || (v_row->>'call_id');
    v_high_priority := true;
  end if;

  if v_trip_id is null then
    return new;
  end if;
  if v_destination is null then
    v_destination := '/?trip=' || v_trip_id || '&view=messages';
  end if;

  insert into public.notification_events (trip_id, actor_id, recipient_id, category, preview, destination, high_priority)
  select v_trip_id, v_actor_id, tm.user_id, v_category, v_preview, v_destination, v_high_priority
  from public.trip_members tm
  where tm.trip_id = v_trip_id
    and exists (select 1 from public.trips t where t.id = v_trip_id)
    and tm.user_id <> coalesce(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;
