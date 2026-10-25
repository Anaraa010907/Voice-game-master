-- 1) The game server reads each player's name, colour and photo when they take a seat.
--    The profile-hardening migration revoked every privilege on profiles, the server's included,
--    so every seat fell back to the name "Тоглогч" with no photo. Reading is all the server needs.
grant select on public.profiles to service_role;

-- 2) Hourly cleanup of rooms nobody is coming back to.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.cleanup_stale_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale text[];
begin
  select coalesce(array_agg(r.room_code), '{}') into stale
  from public.game_rooms r
  left join public.game_states s on s.room_code = r.room_code
  where
    -- Lobbies and finished tables untouched for 6 hours.
    (r.status in ('lobby', 'finished') and r.updated_at < now() - interval '6 hours')
    -- Games where nobody has made a move for 3 hours.
    or (r.status = 'playing' and coalesce(s.updated_at, r.updated_at) < now() - interval '3 hours')
    -- Rooms left with only bots (or nobody) for a while.
    or (r.created_at < now() - interval '10 minutes' and not exists (
      select 1 from public.game_room_players p where p.room_code = r.room_code and not p.is_bot));

  if cardinality(stale) = 0 then
    return 0;
  end if;
  -- Seats, states and views cascade from game_rooms; voice members cascade from voice_rooms.
  delete from public.voice_rooms where room_code = any(stale);
  delete from public.game_rooms where room_code = any(stale);
  return cardinality(stale);
end;
$$;
revoke all on function public.cleanup_stale_rooms() from public, anon, authenticated;

-- Re-running this migration updates the same named job instead of adding another.
select cron.schedule('cleanup-stale-rooms', '17 * * * *', 'select public.cleanup_stale_rooms()');
