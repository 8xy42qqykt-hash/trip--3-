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
      o.sort_order,
      count(v.id)::int as votes,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'color', p.color
          ) order by p.display_name
        ) filter (where p.id is not null),
        '[]'::jsonb
      ) as voters
    from public.poll_options o
    left join public.poll_votes v on v.option_id = o.id
    left join public.profiles p on p.id = v.user_id
    where o.poll_id = p_poll_id
    group by o.id, o.text, o.sort_order
  )
  select
    coalesce(sum(votes), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', option_id,
          'text', option_text,
          'votes', votes,
          'voters', voters
        ) order by sort_order
      ),
      '[]'::jsonb
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
    'options', v_options_json
  );

  insert into public.messages (trip_id, user_id, type, content, metadata)
  values (v_poll.trip_id, auth.uid(), 'poll_result', 'Poll Results: ' || v_poll.question, v_metadata)
  returning id into v_msg_id;

  return v_metadata;
end;
$$;

grant execute on function public.end_poll(uuid) to authenticated;
