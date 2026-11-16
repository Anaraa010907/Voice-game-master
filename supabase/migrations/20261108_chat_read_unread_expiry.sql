-- Chat lifetime: a message the recipient has read is removed one day after it was read; one never
-- read is removed five days after it was sent. pg_cron runs the clean-up every hour.
create or replace function public.expire_direct_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.direct_messages
  where (read_at is not null and read_at < now() - interval '1 day')
     or (read_at is null and created_at < now() - interval '5 days');
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.expire_direct_messages() from public, anon, authenticated;

create or replace function public.my_friends()
returns table (
  id uuid, display_name text, avatar_url text, avatar_key text, frame_key text, player_no integer,
  status text, incoming boolean, online boolean, room_code text, room_name text, game_type text, room_status text,
  unread integer, last_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  return query
  select p.id, p.display_name, p.avatar_url, p.avatar_key, p.frame_key, p.player_no,
    f.status, (f.status = 'pending' and f.requested_by <> me),
    coalesce(p.last_seen_at > now() - interval '2 minutes', false),
    r.room_code, r.name, r.game_type, r.status,
    (select count(*)::integer from public.direct_messages m where m.sender = p.id and m.recipient = me and m.read_at is null and m.created_at > now() - interval '5 days'),
    (select max(m.created_at) from public.direct_messages m where ((m.sender = p.id and m.recipient = me) or (m.sender = me and m.recipient = p.id))
      and (m.read_at > now() - interval '1 day' or (m.read_at is null and m.created_at > now() - interval '5 days')))
  from public.friendships f
  join public.profiles p on p.id = case when f.user_low = me then f.user_high else f.user_low end
  left join lateral (
    select g.room_code, g.name, g.game_type, g.status from public.game_room_players s
    join public.game_rooms g on g.room_code = s.room_code
    where s.user_id = p.id and not s.is_bot
    order by g.updated_at desc limit 1
  ) r on f.status = 'accepted'
  where me in (f.user_low, f.user_high)
  order by (f.status = 'pending' and f.requested_by <> me) desc, coalesce(p.last_seen_at > now() - interval '2 minutes', false) desc, p.display_name;
end;
$$;
