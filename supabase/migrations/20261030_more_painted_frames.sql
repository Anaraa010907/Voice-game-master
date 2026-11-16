-- Six more painted avatar frames (images in public/assets/frames).
insert into public.shop_items (key, kind, name, description, icon, price, sort) values
  ('frame-ice-butterfly', 'frame', 'Мөсөн эрвээхэй', 'Цэнхэр сарнай, мөсөн болор, гэрэлтэх эрвээхэй', '', 1200, 18),
  ('frame-fire-dragon', 'frame', 'Галт луу', 'Өөрийн сүүлээ залгисан дүрэлзэх луу', '', 1500, 19),
  ('frame-mafia-city', 'frame', 'Мафийн хот', 'Малгай, виски, хар машин, шөнийн хот', '', 1800, 20),
  ('frame-gold-skull', 'frame', 'Алтан гавал', 'Титэмтэй алтан гавал, далавч', '', 1800, 21),
  ('frame-twin-serpent', 'frame', 'Ихэр луу', 'Галд ороосон хоёр луу, улаан болор', '', 2200, 22),
  ('frame-eagle-crown', 'frame', 'Хааны бүргэд', 'Алтан бүргэд, титэм, улаан хилэн', '', 2500, 23)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort;
