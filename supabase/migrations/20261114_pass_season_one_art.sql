-- Battle Pass season 1: its own painted looks on the gold track (made for the season), so the
-- painted looks already sold for diamonds stay in the shop. When the season ends these become
-- limited offers at the prices below.
insert into public.shop_items (key, kind, name, description, icon, price, sort, active, currency, source) values
  ('frame-rainy-night', 'frame', 'Бороотой шөнө', 'Хийн дэнлүү, шүхэр, нойтон чулуун зам', '', 70, 310, true, 'diamond', 'pass'),
  ('plate-neon-alley', 'nameplate', 'Неон гудамж', 'Бороотой гудамж, неон гэрэл, хар машин', '', 60, 311, true, 'diamond', 'pass'),
  ('frame-card-master', 'frame', 'Хөзрийн мастер', 'Хөзөр, шоо, покерын чип, улаан хилэн', '', 90, 312, true, 'diamond', 'pass'),
  ('plate-casino', 'nameplate', 'Казино', 'Покерын чип, хөзөр, рулет, виски', '', 70, 313, true, 'diamond', 'pass'),
  ('frame-blood-rose', 'frame', 'Цуст сарнай', 'Улаан сарнай, мөнгөн хутга, цуст сар', '', 110, 314, true, 'diamond', 'pass'),
  ('plate-don-office', 'nameplate', 'Донын өрөө', 'Малгай, навчин тамхи, бөмбөрцөг, шөнийн хот', '', 90, 315, true, 'diamond', 'pass'),
  ('frame-shadow-don', 'frame', 'Сүүдрийн Дон', 'Хэрээний далавч, титэмтэй малгай, ягаан утаа', '', 150, 316, true, 'diamond', 'pass')
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  price = excluded.price, sort = excluded.sort, currency = excluded.currency, source = excluded.source;

-- Gold track: the new looks at tiers 1, 5, 10, 15, 20, 25 and 30 (only while the season is a draft).
update public.pass_rewards r set kind = 'item', amount = 0, item_key = v.item_key
from (values (1, 'frame-rainy-night'), (5, 'plate-neon-alley'), (10, 'frame-card-master'), (15, 'plate-casino'),
             (20, 'frame-blood-rose'), (25, 'plate-don-office'), (30, 'frame-shadow-don')) as v(tier, item_key)
where r.season_id = 1 and r.track = 'premium' and r.tier = v.tier
  and exists (select 1 from public.pass_seasons s where s.id = 1 and s.status = 'draft');
