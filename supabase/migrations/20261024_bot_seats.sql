-- Bot seats for practice games. A bot occupies a seat like a player but has no account,
-- so the seat's user id can no longer be required to exist in auth.users.

alter table public.game_room_players
  add column if not exists is_bot boolean not null default false;

alter table public.game_room_players
  drop constraint if exists game_room_players_user_id_fkey;

-- Real players still lose their seats when their account is deleted (the foreign key used to do this).
create or replace function public.remove_deleted_user_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.game_room_players where user_id = old.id and not is_bot;
  return old;
end;
$$;
revoke all on function public.remove_deleted_user_seats() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleted_remove_seats on auth.users;
create trigger on_auth_user_deleted_remove_seats
  after delete on auth.users
  for each row execute function public.remove_deleted_user_seats();
