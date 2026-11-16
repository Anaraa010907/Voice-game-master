-- Three tiers of looks:
--   * plain, still frames / nameplates / name borders: sold for coins (source 'shop', currency 'coin');
--   * animated rings and name borders: won by reaching ranks (source 'rank'), no longer sold;
--   * painted art: sold for diamonds (source 'shop', currency 'diamond'); later also 'pass' and 'limited'.
-- Players keep everything they already own.

alter table public.shop_items add column if not exists source text not null default 'shop';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shop_items_source_check') then
    alter table public.shop_items add constraint shop_items_source_check check (source in ('shop', 'rank', 'pass', 'limited'));
  end if;
end $$;

-- New animated looks for the rank ladder.
insert into public.shop_items (key, kind, name, description, icon, price, sort, active, currency, source) values
  ('frame-smoke', 'frame', 'Утаат', 'Хүрээг тойрон эргэлдэх утаа', '', 0, 60, true, 'coin', 'rank'),
  ('frame-coins', 'frame', 'Зоосон цагираг', 'Тойрон эргэх алтан зоос', '', 0, 61, true, 'coin', 'rank'),
  ('frame-tycoon', 'frame', 'Тэрбумтны', 'Алт, маргад эрдэнэ, оч', '', 0, 62, true, 'coin', 'rank'),
  ('border-jade', 'border', 'Хаш ногоон', 'Гүйх хаш ногоон гэрэл', '', 0, 63, true, 'coin', 'rank')
on conflict (key) do update set name = excluded.name, description = excluded.description, active = true, source = 'rank';

-- The animated rings and borders sold until now become rank prizes.
update public.shop_items set source = 'rank'
where key in ('frame-gold', 'frame-neon', 'frame-ice', 'frame-fire', 'frame-blood', 'frame-royal',
              'border-gold', 'border-neon', 'border-ice', 'border-fire', 'border-ruby', 'border-royal');

-- Plain looks for coins.
insert into public.shop_items (key, kind, name, description, icon, price, sort, active, currency, source) values
  ('frame-bronze', 'frame', 'Хүрэл', 'Бүдэг хүрэл цагираг', '', 150, 200, true, 'coin', 'shop'),
  ('frame-silver', 'frame', 'Мөнгөн', 'Энгийн мөнгөн цагираг', '', 200, 201, true, 'coin', 'shop'),
  ('frame-wood', 'frame', 'Модон', 'Модны хээтэй цагираг', '', 250, 202, true, 'coin', 'shop'),
  ('frame-brass', 'frame', 'Гуулин', 'Тод бус шар гуулин', '', 300, 203, true, 'coin', 'shop'),
  ('frame-leather', 'frame', 'Оёдолтой арьс', 'Хүрэн арьс, цайвар оёдол', '', 300, 204, true, 'coin', 'shop'),
  ('frame-double', 'frame', 'Хос шугам', 'Хоёр нарийн алтан шугам', '', 350, 205, true, 'coin', 'shop'),
  ('frame-sky', 'frame', 'Тэнгэр цэнхэр', 'Хадаг шиг цэнхэр, цагаан зураас', '', 400, 206, true, 'coin', 'shop'),
  ('frame-onyx', 'frame', 'Хар чулуу', 'Хар чулуу, мөнгөн ирмэг', '', 500, 207, true, 'coin', 'shop'),
  ('frame-khana', 'frame', 'Ханан хээ', 'Гэрийн ханын торлог', '', 600, 208, true, 'coin', 'shop'),
  ('frame-ulzii', 'frame', 'Өлзий хээ', 'Улаан дээр алтан өлзий', '', 800, 209, true, 'coin', 'shop'),
  ('plate-night-blue', 'nameplate', 'Шөнийн хөх', 'Хавирган сар, од, уулс', '', 250, 220, true, 'coin', 'shop'),
  ('plate-paper', 'nameplate', 'Хуучин цаас', 'Шарласан цаас, лацны тамга', '', 300, 221, true, 'coin', 'shop'),
  ('plate-leather', 'nameplate', 'Ширэн', 'Оёдолтой арьс, тамгатай', '', 350, 222, true, 'coin', 'shop'),
  ('plate-marble', 'nameplate', 'Гантиг', 'Цагаан гантиг, саарал судал', '', 450, 223, true, 'coin', 'shop'),
  ('plate-black-gold', 'nameplate', 'Хар алт', 'Хар дээр алтан туяа', '', 600, 224, true, 'coin', 'shop'),
  ('plate-ornament', 'nameplate', 'Хээтэй', 'Улаан дээр алтан хээ', '', 800, 225, true, 'coin', 'shop'),
  ('border-bronze', 'border', 'Хүрэл шугам', 'Нарийн хүрэл хүрээ', '', 150, 240, true, 'coin', 'shop'),
  ('border-silver', 'border', 'Мөнгөн шугам', 'Нарийн мөнгөн хүрээ', '', 200, 241, true, 'coin', 'shop'),
  ('border-ivory', 'border', 'Зааны яс', 'Цайвар шаргал хүрээ', '', 250, 242, true, 'coin', 'shop'),
  ('border-azure', 'border', 'Хөх тэнгэр', 'Цэнхэр хүрээ', '', 300, 243, true, 'coin', 'shop'),
  ('border-crimson', 'border', 'Бордо', 'Бараан улаан хүрээ', '', 300, 244, true, 'coin', 'shop'),
  ('border-double', 'border', 'Хос шугам', 'Хоёр нарийн алтан шугам', '', 400, 245, true, 'coin', 'shop')
on conflict (key) do nothing;

-- What each rank gives the first time it is reached (besides its coins).
update public.rank_rewards r set item_key = v.item_key
from (values
  ('mafia', 2, 'frame-neon'), ('mafia', 3, 'border-neon'), ('mafia', 4, 'frame-ice'), ('mafia', 5, 'border-ruby'),
  ('mafia', 6, 'frame-smoke'), ('mafia', 7, 'border-fire'), ('mafia', 8, 'frame-blood'), ('mafia', 9, 'frame-royal'),
  ('monopoly', 2, 'border-gold'), ('monopoly', 3, 'frame-gold'), ('monopoly', 4, 'border-ice'), ('monopoly', 5, 'frame-coins'),
  ('monopoly', 6, 'border-jade'), ('monopoly', 7, 'frame-fire'), ('monopoly', 8, 'border-royal'), ('monopoly', 9, 'frame-tycoon')
) as v(game_type, level, item_key)
where r.game_type = v.game_type and r.level = v.level;

-- Players who already reached a rank get its prize now.
insert into public.player_items (user_id, item_key)
select pr.user_id, rr.item_key
from public.player_ranks pr
join public.rank_rewards rr on rr.game_type = pr.game_type and rr.level <= public.rank_level(pr.peak_points)
where rr.item_key is not null
on conflict do nothing;

-- Only shop items can be bought or given; rank prizes are won.
create or replace function public.buy_item(p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.shop_items;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into item from public.shop_items where key = p_key and active;
  if not found then raise exception 'Бараа олдсонгүй.' using errcode = 'P0002'; end if;
  if item.kind = 'gift' then raise exception 'Бэлгийг тоглолтын үеэр тоглогч дээр дарж илгээнэ.' using errcode = 'P0001'; end if;
  if item.kind = 'title' then raise exception 'Цолыг рэйтинг тоглолтод хожиж авна.' using errcode = 'P0001'; end if;
  if item.source = 'rank' then raise exception 'Энэ гоёлыг рэйтинг тоглолтод цол ахиж авна.' using errcode = 'P0001'; end if;
  if item.source <> 'shop' then raise exception 'Энэ гоёл одоогоор худалдаанд гараагүй байна.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_items where user_id = me and item_key = p_key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  balance := public.spend_for_item(me, item);
  insert into public.player_items (user_id, item_key) values (me, p_key);
  return balance;
end;
$$;

create or replace function public.send_friend_gift(p_to uuid, p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.shop_items;
  sender_name text;
  receiver_name text;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  if not public.are_friends(me, p_to) then raise exception 'Зөвхөн найздаа бэлэг илгээх боломжтой.' using errcode = '42501'; end if;
  if exists (select 1 from public.game_room_players s join public.game_rooms g on g.room_code = s.room_code
             where s.user_id = me and g.status = 'playing') then
    raise exception 'Тоглолтын үеэр хүрээ, нэрийн хавтан бэлэглэх боломжгүй. Тоглолт дууссаны дараа илгээнэ үү.' using errcode = 'P0001';
  end if;
  select * into item from public.shop_items where key = p_key and active and kind in ('gift', 'frame', 'nameplate', 'border');
  if not found then raise exception 'Бэлэг олдсонгүй.' using errcode = 'P0002'; end if;
  if item.source <> 'shop' then raise exception 'Цолны шагналыг бэлэглэх боломжгүй.' using errcode = 'P0001'; end if;
  if item.kind <> 'gift' and exists (select 1 from public.player_items where user_id = p_to and item_key = p_key) then
    raise exception 'Найзад тань энэ бараа аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.gifts where from_user = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Хэт олон бэлэг илгээлээ. Түр хүлээнэ үү.' using errcode = 'P0001';
  end if;
  balance := public.spend_for_item(me, item);
  select display_name into sender_name from public.profiles where id = me;
  select display_name into receiver_name from public.profiles where id = p_to;
  if item.kind <> 'gift' then
    insert into public.player_items (user_id, item_key) values (p_to, p_key);
  end if;
  insert into public.gifts (room_code, from_user, to_user, from_name, to_name, gift_key) values ('DM', me, p_to, sender_name, receiver_name, p_key);
  insert into public.direct_messages (sender, recipient, kind, body, gift_key) values (me, p_to, 'gift', item.name, p_key);
  return balance;
end;
$$;
