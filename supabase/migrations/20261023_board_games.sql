-- Rooms can host different games: the card/voice game "mafia" or the board game "monopoly".
alter table public.game_rooms
  add column if not exists game_type text not null default 'mafia'
  check (game_type in ('mafia', 'monopoly'));

-- Board games allow smaller tables than Mafia.
alter table public.game_rooms drop constraint if exists game_rooms_max_players_check;
alter table public.game_rooms add constraint game_rooms_max_players_check check (max_players between 2 and 12);

create index if not exists game_rooms_open_by_type on public.game_rooms (game_type, status, is_private, updated_at desc);
