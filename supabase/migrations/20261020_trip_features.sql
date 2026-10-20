begin;

create table if not exists public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  inviter_id uuid references public.profiles(id) on delete cascade not null,
  invitee_user_id uuid references public.profiles(id) on delete cascade,
  email text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  email_sent_at timestamptz
);
alter table public.trip_invitations add column if not exists email text;
alter table public.trip_invitations add column if not exists invitee_user_id uuid references public.profiles(id) on delete cascade;
alter table public.trip_invitations add column if not exists email_sent_at timestamptz;
alter table public.trip_invitations add column if not exists expires_at timestamptz not null default (now() + interval '14 days');
with ranked_pending as (
  select id, row_number() over (
    partition by trip_id, lower(email) order by created_at desc, id desc
  ) as duplicate_rank
  from public.trip_invitations
  where status = 'pending' and email is not null
)
update public.trip_invitations ti
  set status = 'expired'
  from ranked_pending rp
  where ti.id = rp.id and rp.duplicate_rank > 1;
create unique index if not exists trip_invitations_pending_email
  on public.trip_invitations (trip_id, lower(email))
  where status = 'pending' and email is not null;
create index if not exists trip_invitations_invitee_status
  on public.trip_invitations (invitee_user_id, status, expires_at);

create table if not exists public.call_sessions (
  call_id text primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  kind text not null check (kind in ('audio', 'video')),
  host_id uuid references public.profiles(id) on delete cascade not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  participants uuid[] not null default '{}',
  participant_history uuid[] not null default '{}'
);
alter table public.call_sessions
  add column if not exists participant_history uuid[] not null default '{}';

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  enabled boolean not null default true,
  categories jsonb not null default '{"messages":true,"calls":true,"polls":true,"reactions":true,"invitations":true,"trip_updates":true}'::jsonb,
  muted_trip_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences
  add column if not exists enabled boolean not null default true;
alter table public.notification_preferences
  add column if not exists categories jsonb not null default '{"messages":true,"calls":true,"polls":true,"reactions":true,"invitations":true,"trip_updates":true}'::jsonb;
alter table public.notification_preferences
  add column if not exists muted_trip_ids uuid[] not null default '{}';
create table if not exists public.trip_user_activity (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  is_focused boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_events (
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
create index if not exists notification_events_pending
  on public.notification_events (trip_id, recipient_id, created_at)
  where sent_at is null;

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
  if not exists (select 1 from public.trips where id = p_trip_id and owner_id = auth.uid()) then
    raise exception 'Only the trip owner can invite people';
  end if;
  update public.trip_invitations
    set status = 'expired'
    where trip_id = p_trip_id and lower(email) = v_email and status = 'pending' and expires_at <= now();
  select id into v_invitee_id from auth.users
    where lower(email) = v_email and email_confirmed_at is not null limit 1;
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
  select * into v_invitation from public.trip_invitations
    where id = p_invitation_id and invitee_user_id = auth.uid() for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'This invitation is no longer active';
  end if;
  if p_accept then
    insert into public.trip_members (trip_id, user_id, role)
      values (v_invitation.trip_id, auth.uid(), 'member')
      on conflict (trip_id, user_id) do nothing;
    update public.trip_invitations set status = 'accepted', responded_at = now()
      where id = p_invitation_id;
  else
    update public.trip_invitations set status = 'rejected', responded_at = now()
      where id = p_invitation_id;
  end if;
  return v_invitation.trip_id;
end;
$$;
grant execute on function public.create_trip_invitation(uuid, text) to authenticated;
grant execute on function public.respond_to_trip_invitation(uuid, boolean) to authenticated;

create or replace function public.link_pending_trip_invitations()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.trip_invitations set invitee_user_id = new.id
      where lower(email) = lower(new.email) and status = 'pending'
        and expires_at > now() and invitee_user_id is null;
  end if;
  return new;
end;
$$;
drop trigger if exists zz_link_pending_trip_invitations_after_auth on auth.users;
create trigger zz_link_pending_trip_invitations_after_auth
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.link_pending_trip_invitations();
update public.trip_invitations ti
  set invitee_user_id = u.id
  from auth.users u
  where ti.invitee_user_id is null and ti.status = 'pending'
    and ti.expires_at > now() and lower(ti.email) = lower(u.email)
    and u.email_confirmed_at is not null;

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

drop trigger if exists notify_messages on public.messages;
create trigger notify_messages after insert or update on public.messages for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_reactions on public.reactions;
create trigger notify_reactions after insert on public.reactions for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_polls on public.polls;
create trigger notify_polls after insert or update on public.polls for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_poll_votes on public.poll_votes;
create trigger notify_poll_votes after insert on public.poll_votes for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_grocery_items on public.grocery_items;
create trigger notify_grocery_items after insert or update on public.grocery_items for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_meals on public.meals;
create trigger notify_meals after insert or update on public.meals for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_meal_votes on public.meal_votes;
create trigger notify_meal_votes after insert on public.meal_votes for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_events on public.events;
create trigger notify_events after insert or update on public.events for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_event_attendees on public.event_attendees;
create trigger notify_event_attendees after insert or delete on public.event_attendees for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_trip_invitations on public.trip_invitations;
create trigger notify_trip_invitations after insert or update on public.trip_invitations for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_trip_members on public.trip_members;
create trigger notify_trip_members after insert or delete on public.trip_members for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_trip_updates on public.trips;
create trigger notify_trip_updates after update on public.trips for each row execute function public.enqueue_notification_event();
drop trigger if exists notify_call_sessions on public.call_sessions;
create trigger notify_call_sessions after insert on public.call_sessions for each row execute function public.enqueue_notification_event();

alter table public.trip_invitations enable row level security;
alter table public.call_sessions enable row level security;
alter table public.trip_user_activity enable row level security;
alter table public.notification_events enable row level security;

drop policy if exists "Allow authenticated users to read trips" on public.trips;
create policy "Allow authenticated users to read trips" on public.trips
  for select to authenticated using (public.is_trip_member(id));
drop policy if exists "Allow authenticated users to read trip members" on public.trip_members;
create policy "Allow authenticated users to read trip members" on public.trip_members
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to join trips" on public.trip_members;
drop policy if exists "Allow authenticated users to read messages" on public.messages;
create policy "Allow authenticated users to read messages" on public.messages
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to send messages" on public.messages;
create policy "Allow authenticated users to send messages" on public.messages
  for insert to authenticated with check (auth.uid() = user_id and public.is_trip_member(trip_id));
drop policy if exists "Trip members can update structured messages" on public.messages;
create policy "Trip members can update structured messages" on public.messages for update to authenticated
  using (public.is_trip_member(trip_id) and (user_id = auth.uid() or type in ('grocery_list', 'meal', 'plan', 'call')))
  with check (public.is_trip_member(trip_id));

drop policy if exists "Allow authenticated users to read reactions" on public.reactions;
create policy "Allow authenticated users to read reactions" on public.reactions for select to authenticated using (
  exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_trip_member(m.trip_id))
);
drop policy if exists "Allow authenticated users to insert reactions" on public.reactions;
create policy "Allow authenticated users to insert reactions" on public.reactions for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_trip_member(m.trip_id))
);
drop policy if exists "Allow authenticated users to read polls" on public.polls;
create policy "Allow authenticated users to read polls" on public.polls for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to create polls" on public.polls;
create policy "Allow authenticated users to create polls" on public.polls for insert to authenticated with check (
  creator_id = auth.uid() and public.is_trip_member(trip_id)
);
drop policy if exists "Allow creators to update polls" on public.polls;
create policy "Allow creators to update polls" on public.polls for update to authenticated using (
  creator_id = auth.uid() and public.is_trip_member(trip_id)
);
drop policy if exists "Allow authenticated users to read poll options" on public.poll_options;
create policy "Allow authenticated users to read poll options" on public.poll_options for select to authenticated using (
  exists (select 1 from public.polls p where p.id = poll_options.poll_id and public.is_trip_member(p.trip_id))
);
drop policy if exists "Allow authenticated users to insert poll options" on public.poll_options;
create policy "Allow authenticated users to insert poll options" on public.poll_options for insert to authenticated with check (
  exists (select 1 from public.polls p where p.id = poll_options.poll_id and p.creator_id = auth.uid() and public.is_trip_member(p.trip_id))
);
drop policy if exists "Allow authenticated users to read poll votes" on public.poll_votes;
create policy "Allow authenticated users to read poll votes" on public.poll_votes for select to authenticated using (
  exists (select 1 from public.poll_options o join public.polls p on p.id = o.poll_id where o.id = poll_votes.option_id and public.is_trip_member(p.trip_id))
);
drop policy if exists "Allow authenticated users to insert poll votes" on public.poll_votes;
create policy "Allow authenticated users to insert poll votes" on public.poll_votes for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.poll_options o join public.polls p on p.id = o.poll_id
    where o.id = poll_votes.option_id and public.is_trip_member(p.trip_id)
  )
);
drop policy if exists "Allow authenticated users to read groceries" on public.grocery_items;
create policy "Allow authenticated users to read groceries" on public.grocery_items for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to insert groceries" on public.grocery_items;
create policy "Allow authenticated users to insert groceries" on public.grocery_items for insert to authenticated with check (
  user_id = auth.uid() and public.is_trip_member(trip_id)
);
drop policy if exists "Allow authenticated users to update groceries" on public.grocery_items;
create policy "Allow authenticated users to update groceries" on public.grocery_items for update to authenticated using (
  public.is_trip_member(trip_id)
) with check (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to delete groceries" on public.grocery_items;
create policy "Allow authenticated users to delete groceries" on public.grocery_items for delete to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to read meals" on public.meals;
create policy "Allow authenticated users to read meals" on public.meals for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to insert meals" on public.meals;
create policy "Allow authenticated users to insert meals" on public.meals for insert to authenticated with check (
  user_id = auth.uid() and public.is_trip_member(trip_id)
);
drop policy if exists "Allow authenticated users to update meals" on public.meals;
create policy "Allow authenticated users to update meals" on public.meals for update to authenticated using (
  public.is_trip_member(trip_id)
) with check (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to delete meals" on public.meals;
create policy "Allow authenticated users to delete meals" on public.meals for delete to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to read meal votes" on public.meal_votes;
create policy "Allow authenticated users to read meal votes" on public.meal_votes for select to authenticated using (
  exists (select 1 from public.meals m where m.id = meal_votes.meal_id and public.is_trip_member(m.trip_id))
);
drop policy if exists "Allow authenticated users to insert meal votes" on public.meal_votes;
create policy "Allow authenticated users to insert meal votes" on public.meal_votes for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.meals m where m.id = meal_votes.meal_id and public.is_trip_member(m.trip_id))
);
drop policy if exists "Allow authenticated users to read events" on public.events;
create policy "Allow authenticated users to read events" on public.events for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to insert events" on public.events;
create policy "Allow authenticated users to insert events" on public.events for insert to authenticated with check (
  user_id = auth.uid() and public.is_trip_member(trip_id)
);
drop policy if exists "Allow authenticated users to update events" on public.events;
create policy "Allow authenticated users to update events" on public.events for update to authenticated using (
  public.is_trip_member(trip_id)
) with check (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to delete events" on public.events;
create policy "Allow authenticated users to delete events" on public.events for delete to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Allow authenticated users to read event attendees" on public.event_attendees;
create policy "Allow authenticated users to read event attendees" on public.event_attendees for select to authenticated using (
  exists (select 1 from public.events e where e.id = event_attendees.event_id and public.is_trip_member(e.trip_id))
);
drop policy if exists "Allow authenticated users to attend events" on public.event_attendees;
create policy "Allow authenticated users to attend events" on public.event_attendees for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.events e where e.id = event_attendees.event_id and public.is_trip_member(e.trip_id))
);

drop policy if exists "Trip members can read calls" on public.call_sessions;
create policy "Trip members can read calls" on public.call_sessions
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "Trip members can create calls" on public.call_sessions;
create policy "Trip members can create calls" on public.call_sessions
  for insert to authenticated with check (host_id = auth.uid() and public.is_trip_member(trip_id));
drop policy if exists "Trip members can update calls" on public.call_sessions;
create policy "Trip members can update calls" on public.call_sessions
  for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
drop policy if exists "Invitees and members can read trip invitations" on public.trip_invitations;
create policy "Invitees and members can read trip invitations" on public.trip_invitations
  for select to authenticated using (invitee_user_id = auth.uid() or public.is_trip_member(trip_id));
drop policy if exists "Trip members can create invitations" on public.trip_invitations;
create policy "Trip members can create invitations" on public.trip_invitations
  for insert to authenticated with check (false);
drop policy if exists "Inviters and invitees can respond to invitations" on public.trip_invitations;
drop policy if exists "Inviters can update invitations" on public.trip_invitations;
create policy "Inviters can update invitations" on public.trip_invitations
  for update to authenticated using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
drop policy if exists "Inviters can cancel invitations" on public.trip_invitations;
drop policy if exists "Users can manage their push subscriptions" on public.push_subscriptions;
create policy "Users can manage their push subscriptions" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can manage their notification preferences" on public.notification_preferences;
create policy "Users can manage their notification preferences" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can manage own active-trip state" on public.trip_user_activity;
create policy "Users can manage own active-trip state" on public.trip_user_activity
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_sessions'
     ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;
end $$;

commit;
