-- Restrict private presence and call-signaling channels to members of their trip.
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
