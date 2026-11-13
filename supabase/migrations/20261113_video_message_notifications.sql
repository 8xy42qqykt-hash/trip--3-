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
        when tg_op = 'UPDATE' and v_message_type = 'image' then 'Updated a photo'
        when tg_op = 'UPDATE' and v_message_type = 'video' then 'Updated a video'
        when tg_op = 'UPDATE' then 'Edited a message'
        when v_message_type = 'image' then 'Sent a photo'
        when v_message_type = 'video' then 'Sent a video'
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
