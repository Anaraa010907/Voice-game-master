-- Mafia room rules the host picks in the lobby: mode (classic / hard / custom), optional roles,
-- role reveal on conviction, anonymous votes and discussion length. The game function validates
-- and writes them; players read them with the rest of the room row.
alter table public.game_rooms
  add column if not exists settings jsonb not null default '{}'::jsonb;
