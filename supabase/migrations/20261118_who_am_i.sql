-- "Би хэн бэ" (Who Am I): a second game type next to Mafia.
--
-- A Who Am I table lives in the same rows as a Mafia table (game_rooms, game_room_players,
-- game_states.engine for the full state with every identity, game_public for the public view,
-- game_private for each player's view without their own identity). Results go through
-- record_match_result like Mafia (win = highest score).
--
-- What changes:
--   * game_rooms.game_type also allows 'whoami'.
--   * game_rooms.max_players: Who Am I rooms seat 3–10; Mafia keeps its earlier range (2–12).
--   * game_seat_presence: each seated player's last heartbeat. The game server writes it (every few
--     seconds while the Who Am I screen is open, and on every move) and reads it on each tick to mark
--     seats connected or away, so a dropped phone stops holding up a vote. Server-only and outside
--     Realtime, so heartbeats wake nobody's screen. Rows go with their room.
--
-- Idempotent: the constraints are dropped and re-created and the table is created if missing, so it
-- can run again safely.

alter table public.game_rooms drop constraint if exists game_rooms_game_type_check;
alter table public.game_rooms add constraint game_rooms_game_type_check check (game_type in ('mafia', 'whoami'));

alter table public.game_rooms drop constraint if exists game_rooms_max_players_check;
alter table public.game_rooms add constraint game_rooms_max_players_check check (
  case game_type
    when 'whoami' then max_players between 3 and 10
    else max_players between 2 and 12
  end
);

create table if not exists public.game_seat_presence (
  room_code text not null references public.game_rooms (room_code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
alter table public.game_seat_presence enable row level security;
revoke all on public.game_seat_presence from public, anon, authenticated;
grant all on public.game_seat_presence to service_role;
