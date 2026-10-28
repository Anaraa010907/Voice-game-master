-- Three more nameplates: the royal crown, the skull king and the fire dragon.
insert into public.shop_items (key, kind, name, description, icon, price, sort) values
  ('plate-royal-crown', 'nameplate', 'Хааны титэм', 'Улаан хилэн, алтан титэм, лааны гэрэл', '', 1200, 31),
  ('plate-skull-king', 'nameplate', 'Гавлын хаан', 'Хар титэм, алтан гавал, сарны шөнө', '', 1400, 32),
  ('plate-fire-dragon', 'nameplate', 'Галт луу', 'Галт луу, алтан титэм, улаан цайз', '', 1600, 33)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort, active = true;
