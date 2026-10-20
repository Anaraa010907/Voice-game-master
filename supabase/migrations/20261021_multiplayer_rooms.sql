-- Real multiplayer rooms. Every write goes through the `game` Edge Function (service role);
-- signed-in players can only read the rooms they belong to, and only their own secret slice.

create table if not exists public.game_rooms (
  room_code text primary key check (room_code ~ '^[A-Z0-9-]{4,32}$'),
  name text not null check (char_length(name) between 1 and 40),
  host_id uuid not null references auth.users (id) on delete cascade,
  max_players integer not null check (max_players between 4 and 12),
  is_private boolean not null default true,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_room_players (
  room_code text not null references public.game_rooms (room_code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat integer not null check (seat between 1 and 12),
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null default 'rose',
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id),
  unique (room_code, seat)
);
create index if not exists game_room_players_user on public.game_room_players (user_id);

-- Server-only: full engine state (all roles) and the room password hash.
create table if not exists public.game_states (
  room_code text primary key references public.game_rooms (room_code) on delete cascade,
  engine jsonb,
  password_hash text,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

-- What everyone at the table may see.
create table if not exists public.game_public (
  room_code text primary key references public.game_rooms (room_code) on delete cascade,
  view jsonb not null,
  deadline timestamptz,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per player: their own role and private results.
create table if not exists public.game_private (
  room_code text not null references public.game_rooms (room_code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  view jsonb not null,
  version integer not null default 0,
  primary key (room_code, user_id)
);

create or replace function public.is_game_room_member(code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_room_players
    where room_code = code and user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_game_room_member(text) from public, anon;
grant execute on function public.is_game_room_member(text) to authenticated;

alter table public.game_rooms enable row level security;
alter table public.game_room_players enable row level security;
alter table public.game_states enable row level security;
alter table public.game_public enable row level security;
alter table public.game_private enable row level security;

revoke all on public.game_rooms, public.game_room_players, public.game_states, public.game_public, public.game_private from anon, authenticated;
grant all on public.game_rooms, public.game_room_players, public.game_states, public.game_public, public.game_private to service_role;
grant select on public.game_rooms, public.game_room_players, public.game_public, public.game_private to authenticated;

drop policy if exists "Members read their rooms" on public.game_rooms;
create policy "Members read their rooms" on public.game_rooms
  for select to authenticated using (public.is_game_room_member(room_code));

drop policy if exists "Members read the roster" on public.game_room_players;
create policy "Members read the roster" on public.game_room_players
  for select to authenticated using (public.is_game_room_member(room_code));

drop policy if exists "Members read the public table" on public.game_public;
create policy "Members read the public table" on public.game_public
  for select to authenticated using (public.is_game_room_member(room_code));

drop policy if exists "Players read only their own secrets" on public.game_private;
create policy "Players read only their own secrets" on public.game_private
  for select to authenticated using (user_id = (select auth.uid()));

-- Live updates for lobby and game screens. RLS still applies to every change event.
do $$
declare t text;
begin
  foreach t in array array['game_rooms', 'game_room_players', 'game_public', 'game_private'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
