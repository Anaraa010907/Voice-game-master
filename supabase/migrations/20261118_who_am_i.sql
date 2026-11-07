-- "Би хэн бэ" (Who Am I): a second game type next to Mafia.
--
-- No new tables: a Who Am I table lives in the same rows as a Mafia table (game_rooms,
-- game_room_players, game_states.engine for the full state with every identity, game_public for the
-- public view, game_private for each player's view without their own identity). Results go through
-- record_match_result like Mafia (win = highest score).
--
-- What changes:
--   * game_rooms.game_type also allows 'whoami'.
--   * game_rooms.max_players: Who Am I rooms seat 3–10; Mafia keeps its earlier range (2–12).
--
-- Idempotent: both constraints are dropped and re-created, so it can run again safely.

alter table public.game_rooms drop constraint if exists game_rooms_game_type_check;
alter table public.game_rooms add constraint game_rooms_game_type_check check (game_type in ('mafia', 'whoami'));

alter table public.game_rooms drop constraint if exists game_rooms_max_players_check;
alter table public.game_rooms add constraint game_rooms_max_players_check check (
  case game_type
    when 'whoami' then max_players between 3 and 10
    else max_players between 2 and 12
  end
);
