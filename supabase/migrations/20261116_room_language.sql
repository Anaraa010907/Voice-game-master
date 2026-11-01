-- Language pools: every room belongs to one language, so strangers who meet in a voice room can talk.
-- The open-room list and quick join only show rooms of the player's language; joining by code works across languages.
-- Rooms created by older app versions (which send no language) are Mongolian.
alter table public.game_rooms add column if not exists language text not null default 'mn';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_rooms_language_check') then
    alter table public.game_rooms add constraint game_rooms_language_check check (language in ('mn', 'en'));
  end if;
end;
$$;
