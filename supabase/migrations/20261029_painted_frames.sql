-- Two painted avatar frames (images in public/assets/frames).
insert into public.shop_items (key, kind, name, description, icon, price, sort) values
  ('frame-rose-night', 'frame', 'Шөнийн сарнай', 'Нил ягаан сарнай, гэрэлтэх эрвээхэй', '', 1200, 16),
  ('frame-butterfly', 'frame', 'Алтан эрвээхэй', 'Алтан хүрээ, сарнай, унжсан болор', '', 2000, 17)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort;
