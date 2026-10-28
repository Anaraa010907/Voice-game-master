-- Admins may wear any title (and any other active item) to try it out, without owning it.
create or replace function public.equip_item(p_kind text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  if p_kind not in ('frame', 'title', 'nameplate', 'border') then raise exception 'Төрөл буруу байна.' using errcode = '22023'; end if;
  if p_key is not null and not (
    public.is_admin() and exists (select 1 from public.shop_items si where si.key = p_key and si.kind = p_kind and si.active)
  ) and not exists (
    select 1 from public.player_items pi join public.shop_items si on si.key = pi.item_key
    where pi.user_id = me and pi.item_key = p_key and si.kind = p_kind and si.active
  ) then
    raise exception using errcode = 'P0001', message = case when p_kind = 'title' then 'Энэ цолыг рэйтинг тоглолтод хожиж авна.' else 'Энэ бараа танд алга.' end;
  end if;
  if p_kind = 'frame' then
    update public.profiles set frame_key = p_key where id = me;
    update public.game_room_players set frame_key = p_key where user_id = me and not is_bot;
  elsif p_kind = 'nameplate' then
    update public.profiles set nameplate_key = p_key where id = me;
    update public.game_room_players set nameplate_key = p_key where user_id = me and not is_bot;
  elsif p_kind = 'border' then
    update public.profiles set border_key = p_key where id = me;
    update public.game_room_players set border_key = p_key where user_id = me and not is_bot;
  else
    update public.profiles set title_key = p_key where id = me;
  end if;
end;
$$;

revoke all on function public.equip_item(text, text) from public, anon;
grant execute on function public.equip_item(text, text) to authenticated;
