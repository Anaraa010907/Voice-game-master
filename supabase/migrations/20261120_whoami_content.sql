-- "Би хэн бэ" (Who Am I) content in the database, edited by staff (admins and moderators).
--
-- Until now the categories and entries lived only in code (supabase/functions/_shared/whoAmIContent.ts).
-- From here the game server deals from these tables, so staff can add, rename, hide and remove
-- categories and entries, and give an entry a picture, from the admin panel without an app update.
--
-- What changes:
--   * whoami_categories / whoami_entries: the content. The built-in pack (8 categories, 284 entries) is
--     seeded with built_in = true and `on conflict do nothing`, so running this again never undoes an edit.
--     Built-in rows can be edited and hidden but not deleted. Staff rows are deleted softly (deleted_at):
--     their ids are never reused, so saved games and stats stay valid. A game in progress keeps its own
--     copy of every identity it dealt, so hiding or deleting an entry never breaks a running table.
--   * whoami_entry_terms: every spelling a typed guess can match (name, English name, aliases), in the
--     same normalised form as normalizeGuess() in whoAmIEngine.ts. Its primary key makes each spelling
--     belong to one live entry only, so a typed guess is never ambiguous; a trigger keeps it in step.
--   * Staff functions (admin_whoami_*): admins AND moderators (require_staff()); every change is written
--     to admin_actions. whoami_category_list(): the active categories for the room settings (anyone).
--     whoami_game_pack(): the live content for the game server (service_role only).
--   * Storage bucket `whoami`: public read, only staff may upload, replace or delete. One picture per
--     entry, at `<entry-id>.<jpg|png|webp>` (the app shrinks it to at most 300 KB first).
--
-- The game server skips a category with fewer than 10 active entries and falls back to the built-in
-- pack when fewer than 2 categories are usable (supabase/functions/_shared/whoAmICatalog.ts).
--
-- Idempotent: tables, indexes and the bucket are created if missing, functions and policies replaced.

-- ---------- spelling ----------

-- Lower case, ё/ү/ө/й folded to е/у/о/и, anything but letters, digits and spaces turned into a space,
-- spaces collapsed: the same as normalizeGuess(). Cyrillic capitals are mapped by hand so the result
-- does not depend on the database locale.
create or replace function public.whoami_norm(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(translate(coalesce(p_text, ''),
      'АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ',
      'абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя')), 'ёүөй', 'еуои'),
    '[^a-z0-9À-ɏЀ-ӿ[:space:]]', ' ', 'g'),
    '[[:space:]]+', ' ', 'g'));
$$;

-- ---------- content ----------

create table if not exists public.whoami_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 40),
  kid_safe boolean not null default true,
  active boolean not null default true,
  sort integer not null default 100,
  built_in boolean not null default false,
  deleted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists whoami_categories_name_key on public.whoami_categories (public.whoami_norm(name)) where deleted_at is null;
create unique index if not exists whoami_categories_name_en_key on public.whoami_categories (public.whoami_norm(name_en)) where deleted_at is null;

create table if not exists public.whoami_entries (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,63}$'),
  category text not null references public.whoami_categories (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  name_en text check (name_en is null or char_length(btrim(name_en)) between 1 and 40),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 8 and array_position(aliases, null) is null),
  -- Object name inside the `whoami` bucket: always the entry's own id plus an image extension.
  image_path text check (image_path is null or image_path ~ '^[a-z][a-z0-9-]{1,63}\.(jpg|png|webp)$'),
  active boolean not null default true,
  built_in boolean not null default false,
  deleted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whoami_entries_image_is_own check (image_path is null or split_part(image_path, '.', 1) = id)
);
create index if not exists whoami_entries_category on public.whoami_entries (category);

-- Every spelling of every live entry (hidden ones included, so showing them again can never clash).
create table if not exists public.whoami_entry_terms (
  term text primary key,
  entry_id text not null references public.whoami_entries (id) on delete cascade
);
create index if not exists whoami_entry_terms_entry on public.whoami_entry_terms (entry_id);

create or replace function public.whoami_entry_terms_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  word text;
  spelled text;
  other text;
begin
  delete from public.whoami_entry_terms where entry_id = new.id;
  if new.deleted_at is not null then
    return null;
  end if;
  for word, spelled in
    select distinct on (public.whoami_norm(t.value)) public.whoami_norm(t.value), btrim(t.value)
    from unnest(array[new.name, new.name_en] || coalesce(new.aliases, '{}'::text[])) with ordinality as t (value, n)
    where public.whoami_norm(t.value) <> ''
    order by public.whoami_norm(t.value), t.n
  loop
    select e.name into other
    from public.whoami_entry_terms t join public.whoami_entries e on e.id = t.entry_id
    where t.term = word;
    if found then
      raise exception 'Давхардсан нэр: «%» нь «%» дүрд аль хэдийн байна.', spelled, other using errcode = '23505';
    end if;
    insert into public.whoami_entry_terms (term, entry_id) values (word, new.id);
  end loop;
  return null;
end;
$$;
revoke all on function public.whoami_entry_terms_sync() from public, anon, authenticated;

drop trigger if exists whoami_entries_terms on public.whoami_entries;
create trigger whoami_entries_terms
  after insert or update of name, name_en, aliases, deleted_at on public.whoami_entries
  for each row execute function public.whoami_entry_terms_sync();

alter table public.whoami_categories enable row level security;
alter table public.whoami_entries enable row level security;
alter table public.whoami_entry_terms enable row level security;
-- No direct client access: players read the category list through whoami_category_list(), staff edit through
-- the admin_whoami_* functions, and the game server (service_role) reads everything.
revoke all on public.whoami_categories, public.whoami_entries, public.whoami_entry_terms from public, anon, authenticated;
grant all on public.whoami_categories, public.whoami_entries, public.whoami_entry_terms to service_role;

-- ---------- the built-in pack (supabase/functions/_shared/whoAmIContent.ts) ----------

insert into public.whoami_categories (id, name, name_en, kid_safe, sort, built_in) values
  ('animal', 'Амьтан', 'Animals', true, 10, true),
  ('figure', 'Түүхэн зүтгэлтэн', 'Historical figures', true, 20, true),
  ('profession', 'Мэргэжил', 'Professions', true, 30, true),
  ('food', 'Хоол, ундаа', 'Food and drink', true, 40, true),
  ('place', 'Газар, хот', 'Places and cities', true, 50, true),
  ('object', 'Эд зүйл', 'Objects', true, 60, true),
  ('character', 'Үлгэр, домгийн дүр', 'Folk and legend characters', true, 70, true),
  ('sport', 'Спорт, наадам', 'Sports and games', true, 80, true)
on conflict do nothing;

-- Animals (32)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('animal-horse', 'animal', 'Морь', 'Horse', array['адуу'], true),
  ('animal-camel', 'animal', 'Тэмээ', 'Camel', array['бактриан тэмээ'], true),
  ('animal-yak', 'animal', 'Сарлаг', 'Yak', '{}', true),
  ('animal-sheep', 'animal', 'Хонь', 'Sheep', '{}', true),
  ('animal-goat', 'animal', 'Ямаа', 'Goat', '{}', true),
  ('animal-cow', 'animal', 'Үнээ', 'Cow', array['үхэр'], true),
  ('animal-wolf', 'animal', 'Чоно', 'Wolf', array['саарал чоно'], true),
  ('animal-snow-leopard', 'animal', 'Ирвэс', 'Snow leopard', array['цоохор ирвэс'], true),
  ('animal-takhi', 'animal', 'Тахь', 'Przewalski''s horse', array['тахь адуу'], true),
  ('animal-gobi-bear', 'animal', 'Мазаалай', 'Gobi bear', '{}', true),
  ('animal-marmot', 'animal', 'Тарвага', 'Marmot', '{}', true),
  ('animal-golden-eagle', 'animal', 'Бүргэд', 'Golden eagle', array['алтан бүргэд'], true),
  ('animal-fox', 'animal', 'Үнэг', 'Fox', '{}', true),
  ('animal-rabbit', 'animal', 'Туулай', 'Rabbit', '{}', true),
  ('animal-dog', 'animal', 'Нохой', 'Dog', array['банхар'], true),
  ('animal-cat', 'animal', 'Муур', 'Cat', '{}', true),
  ('animal-tiger', 'animal', 'Бар', 'Tiger', '{}', true),
  ('animal-lion', 'animal', 'Арслан', 'Lion', '{}', true),
  ('animal-elephant', 'animal', 'Заан', 'Elephant', '{}', true),
  ('animal-giraffe', 'animal', 'Анааш', 'Giraffe', '{}', true),
  ('animal-bear', 'animal', 'Баавгай', 'Bear', '{}', true),
  ('animal-monkey', 'animal', 'Сармагчин', 'Monkey', array['мич'], true),
  ('animal-penguin', 'animal', 'Оцон шувуу', 'Penguin', array['оцон'], true),
  ('animal-dolphin', 'animal', 'Далайн гахай', 'Dolphin', '{}', true),
  ('animal-whale', 'animal', 'Халим', 'Whale', array['халим загас'], true),
  ('animal-crocodile', 'animal', 'Матар', 'Crocodile', '{}', true),
  ('animal-owl', 'animal', 'Шар шувуу', 'Owl', array['ууль'], true),
  ('animal-crane', 'animal', 'Тогоруу', 'Crane', '{}', true),
  ('animal-gazelle', 'animal', 'Цагаан зээр', 'Mongolian gazelle', array['зээр'], true),
  ('animal-argali', 'animal', 'Аргаль', 'Argali', array['угалз'], true),
  ('animal-hedgehog', 'animal', 'Зараа', 'Hedgehog', '{}', true),
  ('animal-squirrel', 'animal', 'Хэрэм', 'Squirrel', '{}', true)
on conflict do nothing;

-- Historical figures (35)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('figure-chinggis', 'figure', 'Чингис хаан', 'Genghis Khan', array['чингис', 'тэмүжин', 'тэмүүжин'], true),
  ('figure-ogedei', 'figure', 'Өгөдэй хаан', 'Ögedei Khan', array['өгөдэй'], true),
  ('figure-khubilai', 'figure', 'Хубилай хаан', 'Kublai Khan', array['хубилай'], true),
  ('figure-borte', 'figure', 'Бөртэ үжин', 'Börte', array['бөртэ', 'бөртэ хатан'], true),
  ('figure-hoelun', 'figure', 'Өэлүн эх', 'Hoelun', array['өэлүн'], true),
  ('figure-mandukhai', 'figure', 'Мандухай сэцэн хатан', 'Mandukhai the Wise', array['мандухай', 'мандухай хатан'], true),
  ('figure-subutai', 'figure', 'Сүбээдэй баатар', 'Subutai', array['сүбээдэй'], true),
  ('figure-zanabazar', 'figure', 'Өндөр гэгээн Занабазар', 'Zanabazar', array['занабазар', 'өндөр гэгээн'], true),
  ('figure-natsagdorj', 'figure', 'Д.Нацагдорж', 'D. Natsagdorj', array['нацагдорж'], true),
  ('figure-sukhbaatar', 'figure', 'Д.Сүхбаатар', 'D. Sükhbaatar', array['сүхбаатар'], true),
  ('figure-batmunkh-dayan', 'figure', 'Батмөнх даян хаан', 'Dayan Khan', array['даян хаан', 'батмөнх'], true),
  ('figure-khaidu', 'figure', 'Хайду хаан', 'Kaidu', array['хайду'], true),
  ('figure-tomyris', 'figure', 'Томирис хатан', 'Tomyris', array['томирис'], true),
  ('figure-marco-polo', 'figure', 'Марко Поло', 'Marco Polo', '{}', true),
  ('figure-einstein', 'figure', 'Альберт Эйнштейн', 'Albert Einstein', array['эйнштейн'], true),
  ('figure-newton', 'figure', 'Исаак Ньютон', 'Isaac Newton', array['ньютон'], true),
  ('figure-da-vinci', 'figure', 'Леонардо да Винчи', 'Leonardo da Vinci', array['да винчи', 'леонардо'], true),
  ('figure-mozart', 'figure', 'Вольфганг Амадей Моцарт', 'Mozart', array['моцарт'], true),
  ('figure-beethoven', 'figure', 'Людвиг ван Бетховен', 'Beethoven', array['бетховен'], true),
  ('figure-shakespeare', 'figure', 'Уильям Шекспир', 'William Shakespeare', array['шекспир'], true),
  ('figure-curie', 'figure', 'Мари Кюри', 'Marie Curie', array['кюри'], true),
  ('figure-columbus', 'figure', 'Христофор Колумб', 'Christopher Columbus', array['колумб'], true),
  ('figure-napoleon', 'figure', 'Наполеон Бонапарт', 'Napoleon', array['наполеон'], true),
  ('figure-cleopatra', 'figure', 'Клеопатра', 'Cleopatra', '{}', true),
  ('figure-galileo', 'figure', 'Галилео Галилей', 'Galileo Galilei', array['галилей', 'галилео'], true),
  ('figure-darwin', 'figure', 'Чарльз Дарвин', 'Charles Darwin', array['дарвин'], true),
  ('figure-edison', 'figure', 'Томас Эдисон', 'Thomas Edison', array['эдисон'], true),
  ('figure-tesla', 'figure', 'Никола Тесла', 'Nikola Tesla', array['тесла'], true),
  ('figure-gagarin', 'figure', 'Юрий Гагарин', 'Yuri Gagarin', array['гагарин'], true),
  ('figure-armstrong', 'figure', 'Нил Армстронг', 'Neil Armstrong', array['армстронг'], true),
  ('figure-gandhi', 'figure', 'Махатма Ганди', 'Mahatma Gandhi', array['ганди'], true),
  ('figure-van-gogh', 'figure', 'Винсент ван Гог', 'Vincent van Gogh', array['ван гог'], true),
  ('figure-aristotle', 'figure', 'Аристотель', 'Aristotle', '{}', true),
  ('figure-confucius', 'figure', 'Күнз', 'Confucius', array['конфуций'], true),
  ('figure-alexander', 'figure', 'Македонийн Александр', 'Alexander the Great', array['их александр', 'александр македонский'], true)
on conflict do nothing;

-- Professions (30)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('job-doctor', 'profession', 'Эмч', 'Doctor', '{}', true),
  ('job-teacher', 'profession', 'Багш', 'Teacher', '{}', true),
  ('job-herder', 'profession', 'Малчин', 'Herder', '{}', true),
  ('job-driver', 'profession', 'Жолооч', 'Driver', '{}', true),
  ('job-cook', 'profession', 'Тогооч', 'Cook', array['повар'], true),
  ('job-police', 'profession', 'Цагдаа', 'Police officer', '{}', true),
  ('job-firefighter', 'profession', 'Гал сөнөөгч', 'Firefighter', '{}', true),
  ('job-pilot', 'profession', 'Нисгэгч', 'Pilot', '{}', true),
  ('job-astronaut', 'profession', 'Сансрын нисгэгч', 'Astronaut', array['сансрын нисэгч'], true),
  ('job-programmer', 'profession', 'Программист', 'Programmer', array['програмист', 'хөгжүүлэгч'], true),
  ('job-builder', 'profession', 'Барилгачин', 'Builder', '{}', true),
  ('job-farmer', 'profession', 'Тариаланч', 'Farmer', '{}', true),
  ('job-singer', 'profession', 'Дуучин', 'Singer', '{}', true),
  ('job-actor', 'profession', 'Жүжигчин', 'Actor', '{}', true),
  ('job-painter', 'profession', 'Зураач', 'Painter', '{}', true),
  ('job-writer', 'profession', 'Зохиолч', 'Writer', '{}', true),
  ('job-journalist', 'profession', 'Сэтгүүлч', 'Journalist', '{}', true),
  ('job-lawyer', 'profession', 'Хуульч', 'Lawyer', '{}', true),
  ('job-dentist', 'profession', 'Шүдний эмч', 'Dentist', '{}', true),
  ('job-vet', 'profession', 'Малын эмч', 'Veterinarian', array['мал эмнэлэгч'], true),
  ('job-soldier', 'profession', 'Цэрэг', 'Soldier', '{}', true),
  ('job-wrestler', 'profession', 'Бөх', 'Wrestler', array['барилдаанч'], true),
  ('job-miner', 'profession', 'Уурхайчин', 'Miner', '{}', true),
  ('job-tailor', 'profession', 'Оёдолчин', 'Tailor', '{}', true),
  ('job-photographer', 'profession', 'Гэрэл зурагчин', 'Photographer', '{}', true),
  ('job-scientist', 'profession', 'Эрдэмтэн', 'Scientist', '{}', true),
  ('job-librarian', 'profession', 'Номын санч', 'Librarian', '{}', true),
  ('job-barber', 'profession', 'Үсчин', 'Hairdresser', '{}', true),
  ('job-postman', 'profession', 'Шуудан зөөгч', 'Postal worker', array['шуудангийн ажилтан'], true),
  ('job-sculptor', 'profession', 'Уран барималч', 'Sculptor', array['барималч'], true)
on conflict do nothing;

-- Food and drink (30)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('food-buuz', 'food', 'Бууз', 'Buuz', '{}', true),
  ('food-khuushuur', 'food', 'Хуушуур', 'Khuushuur', '{}', true),
  ('food-tsuivan', 'food', 'Цуйван', 'Tsuivan', '{}', true),
  ('food-khorkhog', 'food', 'Хорхог', 'Khorkhog', '{}', true),
  ('food-boodog', 'food', 'Боодог', 'Boodog', '{}', true),
  ('food-bansh', 'food', 'Банш', 'Bansh', '{}', true),
  ('food-guriltai-shol', 'food', 'Гурилтай шөл', 'Noodle soup', '{}', true),
  ('food-aaruul', 'food', 'Ааруул', 'Aaruul', array['аарц'], true),
  ('food-airag', 'food', 'Айраг', 'Airag', array['гүүний айраг'], true),
  ('food-suutei-tsai', 'food', 'Сүүтэй цай', 'Milk tea', array['цай'], true),
  ('food-urum', 'food', 'Өрөм', 'Clotted cream', array['өрөм тос'], true),
  ('food-boortsog', 'food', 'Боорцог', 'Boortsog', '{}', true),
  ('food-ul-boov', 'food', 'Ул боов', 'Ul boov', '{}', true),
  ('food-tarag', 'food', 'Тараг', 'Yoghurt', '{}', true),
  ('food-byaslag', 'food', 'Бяслаг', 'Cheese', '{}', true),
  ('food-pizza', 'food', 'Пицца', 'Pizza', array['пица'], true),
  ('food-ice-cream', 'food', 'Зайрмаг', 'Ice cream', array['мороженое'], true),
  ('food-bread', 'food', 'Талх', 'Bread', '{}', true),
  ('food-rice', 'food', 'Будаа', 'Rice', array['цагаан будаа'], true),
  ('food-egg', 'food', 'Өндөг', 'Egg', '{}', true),
  ('food-apple', 'food', 'Алим', 'Apple', '{}', true),
  ('food-watermelon', 'food', 'Тарвас', 'Watermelon', '{}', true),
  ('food-banana', 'food', 'Гадил', 'Banana', array['банана'], true),
  ('food-carrot', 'food', 'Лууван', 'Carrot', '{}', true),
  ('food-potato', 'food', 'Төмс', 'Potato', '{}', true),
  ('food-chocolate', 'food', 'Шоколад', 'Chocolate', '{}', true),
  ('food-cake', 'food', 'Бялуу', 'Cake', array['торт'], true),
  ('food-sea-buckthorn', 'food', 'Чацаргана', 'Sea buckthorn', '{}', true),
  ('food-honey', 'food', 'Зөгийн бал', 'Honey', array['бал'], true),
  ('food-khuurga', 'food', 'Хуурга', 'Khuurga', array['мах хуурга'], true)
on conflict do nothing;

-- Places and cities (30)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('place-ulaanbaatar', 'place', 'Улаанбаатар', 'Ulaanbaatar', array['уб', 'нийслэл'], true),
  ('place-kharkhorin', 'place', 'Хархорин', 'Kharkhorin', array['хархорум'], true),
  ('place-khuvsgul', 'place', 'Хөвсгөл нуур', 'Lake Khövsgöl', array['хөвсгөл'], true),
  ('place-gobi', 'place', 'Говь', 'Gobi Desert', array['говь цөл'], true),
  ('place-khongor', 'place', 'Хонгорын элс', 'Khongoryn Els', '{}', true),
  ('place-altai', 'place', 'Алтай нуруу', 'Altai Mountains', array['алтай'], true),
  ('place-terelj', 'place', 'Тэрэлж', 'Terelj', '{}', true),
  ('place-erdene-zuu', 'place', 'Эрдэнэ зуу хийд', 'Erdene Zuu Monastery', array['эрдэнэ зуу'], true),
  ('place-orkhon', 'place', 'Орхон хөндий', 'Orkhon Valley', array['орхоны хөндий'], true),
  ('place-khustai', 'place', 'Хустайн нуруу', 'Khustai National Park', array['хустай'], true),
  ('place-darkhan', 'place', 'Дархан', 'Darkhan', '{}', true),
  ('place-erdenet', 'place', 'Эрдэнэт', 'Erdenet', '{}', true),
  ('place-tsonjin-boldog', 'place', 'Цонжин болдог', 'Genghis Khan Equestrian Statue', array['чингисийн морьт хөшөө'], true),
  ('place-sukhbaatar-square', 'place', 'Сүхбаатарын талбай', 'Sükhbaatar Square', array['төв талбай'], true),
  ('place-moon', 'place', 'Сар', 'The Moon', '{}', true),
  ('place-sun', 'place', 'Нар', 'The Sun', '{}', true),
  ('place-beijing', 'place', 'Бээжин', 'Beijing', '{}', true),
  ('place-moscow', 'place', 'Москва', 'Moscow', '{}', true),
  ('place-tokyo', 'place', 'Токио', 'Tokyo', '{}', true),
  ('place-seoul', 'place', 'Сөүл', 'Seoul', '{}', true),
  ('place-paris', 'place', 'Парис', 'Paris', '{}', true),
  ('place-london', 'place', 'Лондон', 'London', '{}', true),
  ('place-new-york', 'place', 'Нью-Йорк', 'New York', array['нью йорк'], true),
  ('place-great-wall', 'place', 'Цагаан хэрэм', 'Great Wall of China', array['хятадын цагаан хэрэм'], true),
  ('place-pyramids', 'place', 'Египетийн пирамид', 'Pyramids of Egypt', array['пирамид'], true),
  ('place-everest', 'place', 'Эверест уул', 'Mount Everest', array['эверест', 'жомолунгма'], true),
  ('place-amazon', 'place', 'Амазон', 'Amazon River', array['амазон мөрөн'], true),
  ('place-north-pole', 'place', 'Хойд туйл', 'North Pole', '{}', true),
  ('place-sahara', 'place', 'Сахар цөл', 'Sahara', array['сахар'], true),
  ('place-baikal', 'place', 'Байгал нуур', 'Lake Baikal', array['байгал'], true)
on conflict do nothing;

-- Objects (70)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('object-ger', 'object', 'Гэр', 'Ger (yurt)', array['монгол гэр', 'юрт'], true),
  ('object-morin-khuur', 'object', 'Морин хуур', 'Horsehead fiddle', '{}', true),
  ('object-deel', 'object', 'Дээл', 'Deel', '{}', true),
  ('object-gutal', 'object', 'Гутал', 'Boots', array['монгол гутал'], true),
  ('object-saddle', 'object', 'Эмээл', 'Saddle', '{}', true),
  ('object-shagai', 'object', 'Шагай', 'Ankle bones', array['шагай наадам'], true),
  ('object-bow', 'object', 'Нум сум', 'Bow and arrow', array['нум'], true),
  ('object-phone', 'object', 'Гар утас', 'Mobile phone', array['утас'], true),
  ('object-computer', 'object', 'Компьютер', 'Computer', array['зөөврийн компьютер', 'ноутбүүк'], true),
  ('object-tv', 'object', 'Зурагт', 'Television', array['телевиз'], true),
  ('object-fridge', 'object', 'Хөргөгч', 'Fridge', '{}', true),
  ('object-clock', 'object', 'Цаг', 'Clock', '{}', true),
  ('object-mirror', 'object', 'Толь', 'Mirror', '{}', true),
  ('object-umbrella', 'object', 'Шүхэр', 'Umbrella', '{}', true),
  ('object-key', 'object', 'Түлхүүр', 'Key', '{}', true),
  ('object-book', 'object', 'Ном', 'Book', '{}', true),
  ('object-pencil', 'object', 'Харандаа', 'Pencil', '{}', true),
  ('object-scissors', 'object', 'Хайч', 'Scissors', '{}', true),
  ('object-spoon', 'object', 'Халбага', 'Spoon', '{}', true),
  ('object-kettle', 'object', 'Данх', 'Kettle', array['цайны данх'], true),
  ('object-bicycle', 'object', 'Унадаг дугуй', 'Bicycle', array['дугуй'], true),
  ('object-car', 'object', 'Машин', 'Car', array['автомашин'], true),
  ('object-airplane', 'object', 'Онгоц', 'Airplane', array['нисэх онгоц'], true),
  ('object-train', 'object', 'Галт тэрэг', 'Train', '{}', true),
  ('object-ball', 'object', 'Бөмбөг', 'Ball', '{}', true),
  ('object-glasses', 'object', 'Нүдний шил', 'Glasses', array['шил'], true),
  ('object-camera', 'object', 'Камер', 'Camera', array['фотоаппарат'], true),
  ('object-guitar', 'object', 'Гитар', 'Guitar', '{}', true),
  ('object-lamp', 'object', 'Чийдэн', 'Lamp', array['гэрэл'], true),
  ('object-backpack', 'object', 'Үүргэвч', 'Backpack', array['цүнх'], true),
  ('object-toono', 'object', 'Тооно', 'Toono (ger crown ring)', array['гэрийн тооно'], true),
  ('object-khadag', 'object', 'Хадаг', 'Khadag (ceremonial scarf)', array['цэнхэр хадаг'], true),
  ('object-snuff-bottle', 'object', 'Хөөрөг', 'Snuff bottle', '{}', true),
  ('object-tashuur', 'object', 'Ташуур', 'Riding whip', array['морины ташуур'], true),
  ('object-dombo', 'object', 'Домбо', 'Dombo (tea jug)', array['цайны домбо'], true),
  ('object-tulga', 'object', 'Тулга', 'Hearth stand', array['гал тулга'], true),
  ('object-uurga', 'object', 'Уурга', 'Lasso pole (uurga)', '{}', true),
  ('object-yatga', 'object', 'Ятга', 'Yatga (zither)', array['монгол ятга'], true),
  ('object-khukhuur', 'object', 'Хөхүүр', 'Airag skin bag', '{}', true),
  ('object-bowl', 'object', 'Аяга', 'Bowl', array['цайны аяга'], true),
  ('object-hat', 'object', 'Малгай', 'Hat', array['монгол малгай'], true),
  ('object-sash', 'object', 'Бүс', 'Sash (belt)', array['бүслүүр'], true),
  ('object-pillow', 'object', 'Дэр', 'Pillow', '{}', true),
  ('object-carpet', 'object', 'Хивс', 'Carpet', '{}', true),
  ('object-chair', 'object', 'Сандал', 'Chair', '{}', true),
  ('object-table', 'object', 'Ширээ', 'Table', '{}', true),
  ('object-broom', 'object', 'Шүүр', 'Broom', '{}', true),
  ('object-soap', 'object', 'Саван', 'Soap', '{}', true),
  ('object-toothbrush', 'object', 'Шүдний сойз', 'Toothbrush', array['сойз'], true),
  ('object-chopsticks', 'object', 'Савх', 'Chopsticks', '{}', true),
  ('object-candle', 'object', 'Лаа', 'Candle', '{}', true),
  ('object-pen', 'object', 'Үзэг', 'Pen', array['бал үзэг'], true),
  ('object-eraser', 'object', 'Баллуур', 'Eraser', '{}', true),
  ('object-notebook', 'object', 'Дэвтэр', 'Notebook', '{}', true),
  ('object-globe', 'object', 'Бөмбөрцөг', 'Globe', array['дэлхийн бөмбөрцөг', 'глобус'], true),
  ('object-hammer', 'object', 'Алх', 'Hammer', '{}', true),
  ('object-saw', 'object', 'Хөрөө', 'Saw', '{}', true),
  ('object-needle', 'object', 'Зүү', 'Needle', array['оёдлын зүү'], true),
  ('object-compass', 'object', 'Луужин', 'Compass', '{}', true),
  ('object-headphones', 'object', 'Чихэвч', 'Headphones', '{}', true),
  ('object-remote', 'object', 'Пульт', 'Remote control', array['алсын удирдлага'], true),
  ('object-fan', 'object', 'Сэнс', 'Electric fan', '{}', true),
  ('object-doll', 'object', 'Хүүхэлдэй', 'Doll', '{}', true),
  ('object-kite', 'object', 'Цаасан шувуу', 'Kite', '{}', true),
  ('object-dice', 'object', 'Шоо', 'Dice', '{}', true),
  ('object-ring', 'object', 'Бөгж', 'Ring', '{}', true),
  ('object-gloves', 'object', 'Бээлий', 'Gloves', array['бээлэй'], true),
  ('object-wallet', 'object', 'Хэтэвч', 'Wallet', array['түрийвч'], true),
  ('object-motorcycle', 'object', 'Мотоцикл', 'Motorcycle', array['мотоцикль'], true),
  ('object-helicopter', 'object', 'Нисдэг тэрэг', 'Helicopter', array['вертолёт'], true)
on conflict do nothing;

-- Folk and legend characters (30)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('character-geser', 'character', 'Гэсэр хаан', 'King Gesar', array['гэсэр'], true),
  ('character-jangar', 'character', 'Жангар', 'Jangar', '{}', true),
  ('character-garuda', 'character', 'Хан Гарьд', 'Garuda', array['гарьд'], true),
  ('character-dragon', 'character', 'Луу', 'Dragon', '{}', true),
  ('character-mangas', 'character', 'Мангас', 'Mangas (ogre)', array['олон толгойт мангас'], true),
  ('character-shulam', 'character', 'Шулам', 'Witch', '{}', true),
  ('character-khuku-namjil', 'character', 'Хөхөө Намжил', 'Khökhöö Namjil', array['намжил'], true),
  ('character-badarchin', 'character', 'Бадарчин', 'Wandering monk', '{}', true),
  ('character-balansenge', 'character', 'Балансэнгэ', 'Balansenge', '{}', true),
  ('character-yeti', 'character', 'Алмас', 'Almas (Yeti)', array['цасан хүн', 'алмас хүн'], true),
  ('character-olgoi-khorkhoi', 'character', 'Олгой хорхой', 'Mongolian death worm', '{}', true),
  ('character-santa', 'character', 'Өвлийн өвгөн', 'Grandfather Frost', array['дед мороз', 'санта клаус'], true),
  ('character-snow-maiden', 'character', 'Цасан охин', 'Snow Maiden', '{}', true),
  ('character-golden-fish', 'character', 'Алтан загас', 'Golden fish', '{}', true),
  ('character-mermaid', 'character', 'Лусын дагина', 'Mermaid', array['усны дагина'], true),
  ('character-unicorn', 'character', 'Ганц эвэрт морь', 'Unicorn', array['ганц эвэрт'], true),
  ('character-phoenix', 'character', 'Галт шувуу', 'Phoenix', '{}', true),
  ('character-robin-hood', 'character', 'Робин Гуд', 'Robin Hood', '{}', true),
  ('character-sherlock', 'character', 'Шерлок Холмс', 'Sherlock Holmes', array['шерлок'], true),
  ('character-aladdin', 'character', 'Аладдин', 'Aladdin', array['аладин'], true),
  ('character-sinbad', 'character', 'Синдбад далайчин', 'Sinbad the Sailor', array['синдбад'], true),
  ('character-cinderella', 'character', 'Үнсгэлжин', 'Cinderella', '{}', true),
  ('character-red-riding-hood', 'character', 'Улаан малгайт', 'Little Red Riding Hood', '{}', true),
  ('character-pinocchio', 'character', 'Пиноккио', 'Pinocchio', array['буратино'], true),
  ('character-snow-white', 'character', 'Цасан цагаан гүнж', 'Snow White', array['цасан цагаан'], true),
  ('character-don-quixote', 'character', 'Дон Кихот', 'Don Quixote', '{}', true),
  ('character-hercules', 'character', 'Геркулес', 'Hercules', array['геракл'], true),
  ('character-gulliver', 'character', 'Гулливер', 'Gulliver', '{}', true),
  ('character-baron-munchausen', 'character', 'Барон Мюнхгаузен', 'Baron Munchausen', array['мюнхгаузен'], true),
  ('character-king-arthur', 'character', 'Артур хаан', 'King Arthur', '{}', true)
on conflict do nothing;

-- Sports and games (27)
insert into public.whoami_entries (id, category, name, name_en, aliases, built_in) values
  ('sport-wrestling', 'sport', 'Бөхийн барилдаан', 'Mongolian wrestling', array['барилдаан'], true),
  ('sport-horse-racing', 'sport', 'Морин уралдаан', 'Horse racing', array['морь уралдаан'], true),
  ('sport-archery', 'sport', 'Сур харваа', 'Archery', array['харваа'], true),
  ('sport-shagai-shooting', 'sport', 'Шагай харваа', 'Knucklebone shooting', '{}', true),
  ('sport-football', 'sport', 'Хөл бөмбөг', 'Football', array['футбол'], true),
  ('sport-basketball', 'sport', 'Сагсан бөмбөг', 'Basketball', array['сагс'], true),
  ('sport-volleyball', 'sport', 'Гар бөмбөг', 'Volleyball', array['волейбол'], true),
  ('sport-chess', 'sport', 'Шатар', 'Chess', '{}', true),
  ('sport-judo', 'sport', 'Жүдо бөх', 'Judo', array['жүдо'], true),
  ('sport-boxing', 'sport', 'Бокс', 'Boxing', '{}', true),
  ('sport-swimming', 'sport', 'Усан сэлэлт', 'Swimming', array['сэлэлт'], true),
  ('sport-skiing', 'sport', 'Цанаар гулгах', 'Skiing', array['цана'], true),
  ('sport-skating', 'sport', 'Тэшүүр', 'Ice skating', array['тэшүүрээр гулгах'], true),
  ('sport-tennis', 'sport', 'Теннис', 'Tennis', '{}', true),
  ('sport-table-tennis', 'sport', 'Ширээний теннис', 'Table tennis', array['пинг понг'], true),
  ('sport-running', 'sport', 'Гүйлт', 'Running', array['марафон'], true),
  ('sport-cycling', 'sport', 'Дугуйн спорт', 'Cycling', '{}', true),
  ('sport-gymnastics', 'sport', 'Гимнастик', 'Gymnastics', '{}', true),
  ('sport-weightlifting', 'sport', 'Хүндийн өргөлт', 'Weightlifting', '{}', true),
  ('sport-ice-hockey', 'sport', 'Хоккей', 'Ice hockey', array['шайбтай хоккей'], true),
  ('sport-badminton', 'sport', 'Бадминтон', 'Badminton', '{}', true),
  ('sport-climbing', 'sport', 'Уулын авиралт', 'Climbing', array['авиралт'], true),
  ('sport-dance', 'sport', 'Бүжиг', 'Dance', '{}', true),
  ('sport-camel-racing', 'sport', 'Тэмээн уралдаан', 'Camel racing', '{}', true),
  ('sport-eagle-hunting', 'sport', 'Бүргэдийн ан', 'Eagle hunting', array['бүргэдчин'], true),
  ('sport-checkers', 'sport', 'Даам', 'Checkers', array['даамын тоглоом'], true),
  ('sport-olympics', 'sport', 'Олимпын наадам', 'Olympic Games', array['олимп'], true)
on conflict do nothing;


-- ---------- helpers (called only by the functions below) ----------

-- Trimmed text with single spaces, or null when nothing is left.
create or replace function public.whoami_clean(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(p_text, ''), '[[:space:]]+', ' ', 'g')), '');
$$;

create or replace function public.whoami_check_name(p_text text, p_english boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text is null or char_length(p_text) > 40 or public.whoami_norm(p_text) = '' then
    if p_english then
      raise exception 'Англи нэр 1–40 тэмдэгт байх ёстой.' using errcode = '22023';
    end if;
    raise exception 'Нэр 1–40 тэмдэгт байх ёстой.' using errcode = '22023';
  end if;
end;
$$;

-- Aliases: trimmed, without blanks, repeats or spellings of the entry's own names; at most 8 of 40 characters.
create or replace function public.whoami_clean_aliases(p_aliases text[], p_name text, p_name_en text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text[] := '{}';
  seen text[] := array[public.whoami_norm(p_name), public.whoami_norm(p_name_en)];
  value text;
  word text;
begin
  foreach value in array coalesce(p_aliases, '{}'::text[]) loop
    value := public.whoami_clean(value);
    if value is null then continue; end if;
    if char_length(value) > 40 then
      raise exception 'Өөр нэр 40 тэмдэгтээс урт байж болохгүй.' using errcode = '22023';
    end if;
    word := public.whoami_norm(value);
    if word = '' or word = any(seen) then continue; end if;
    seen := seen || word;
    result := result || value;
  end loop;
  if cardinality(result) > 8 then
    raise exception 'Өөр нэр 8-аас олон байж болохгүй.' using errcode = '22023';
  end if;
  return result;
end;
$$;

-- Category names are unique (Mongolian and English, in normalised form) among live categories.
create or replace function public.whoami_check_category_names(p_id text, p_name text, p_name_en text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.whoami_check_name(p_name, false);
  perform public.whoami_check_name(p_name_en, true);
  if exists (
    select 1 from public.whoami_categories c
    where c.deleted_at is null and c.id is distinct from p_id
      and (public.whoami_norm(c.name) in (public.whoami_norm(p_name), public.whoami_norm(p_name_en))
        or public.whoami_norm(c.name_en) in (public.whoami_norm(p_name), public.whoami_norm(p_name_en)))
  ) then
    raise exception 'Ийм нэртэй ангилал аль хэдийн байна.' using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.whoami_clean(text), public.whoami_check_name(text, boolean), public.whoami_clean_aliases(text[], text, text),
  public.whoami_check_category_names(text, text, text) from public, anon, authenticated;

-- ---------- staff: read ----------

-- Every live category (hidden ones too) with its counts, and the live entries of one category (or of all).
create or replace function public.admin_whoami_list(p_category text default null)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return json_build_object(
    'min_entries', 10,
    'categories', coalesce((
      select json_agg(row_to_json(x) order by x.sort, x.id) from (
        select c.id, c.name, c.name_en, c.kid_safe, c.active, c.built_in, c.sort, c.updated_at,
          count(e.id)::integer as entries,
          (count(e.id) filter (where e.active))::integer as active_entries,
          count(e.image_path)::integer as images
        from public.whoami_categories c
        left join public.whoami_entries e on e.category = c.id and e.deleted_at is null
        where c.deleted_at is null
        group by c.id
      ) x), '[]'::json),
    'entries', coalesce((
      select json_agg(row_to_json(y) order by y.category, y.name) from (
        select e.id, e.category, e.name, e.name_en, e.aliases, e.image_path, e.active, e.built_in, e.updated_at
        from public.whoami_entries e
        join public.whoami_categories c on c.id = e.category and c.deleted_at is null
        where e.deleted_at is null and (p_category is null or e.category = p_category)
      ) y), '[]'::json)
  );
end;
$$;

-- ---------- staff: categories ----------

-- Returns the new category's id, made from its English name.
create or replace function public.admin_whoami_add_category(p_name text, p_name_en text, p_kid_safe boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  clean_name text := public.whoami_clean(p_name);
  clean_en text := public.whoami_clean(p_name_en);
  base text;
  slug text;
begin
  perform public.whoami_check_category_names(null, clean_name, clean_en);
  base := btrim(regexp_replace(lower(clean_en), '[^a-z0-9]+', '-', 'g'), '-');
  -- An id starts with a letter and has 2+ characters ("X" or "3D" become "cat-x", "cat-3d").
  if base !~ '^[a-z]' or char_length(base) < 2 then base := 'cat-' || base; end if;
  base := rtrim(left(base, 24), '-');
  slug := base;
  while exists (select 1 from public.whoami_categories where id = slug) loop
    slug := base || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into public.whoami_categories (id, name, name_en, kid_safe, sort, created_by, updated_by)
  values (slug, clean_name, clean_en, coalesce(p_kid_safe, true), coalesce((select max(sort) from public.whoami_categories), 0) + 10, me, me);
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'whoami-category-add', slug, left(clean_name || ' · ' || clean_en, 120));
  return slug;
end;
$$;

-- Rename, and the kid-friendly flag (null keeps it).
create or replace function public.admin_whoami_update_category(p_id text, p_name text, p_name_en text, p_kid_safe boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  clean_name text := public.whoami_clean(p_name);
  clean_en text := public.whoami_clean(p_name_en);
  old public.whoami_categories;
begin
  select * into old from public.whoami_categories where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Ангилал олдсонгүй.' using errcode = 'P0002'; end if;
  perform public.whoami_check_category_names(p_id, clean_name, clean_en);
  update public.whoami_categories
  set name = clean_name, name_en = clean_en, kid_safe = coalesce(p_kid_safe, kid_safe), updated_by = me, updated_at = now()
  where id = p_id;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'whoami-category-edit', p_id, left(old.name || case when old.name <> clean_name then ' → ' || clean_name else '' end
    || ' · ' || clean_en || case when coalesce(p_kid_safe, old.kid_safe) then '' else ' · 18+' end, 120));
end;
$$;

-- Hide (false) or show (true): a hidden category is never dealt; its entries stay as they are.
create or replace function public.admin_whoami_set_category_active(p_id text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  label text;
begin
  update public.whoami_categories set active = coalesce(p_active, true), updated_by = me, updated_at = now()
  where id = p_id and deleted_at is null
  returning name into label;
  if not found then raise exception 'Ангилал олдсонгүй.' using errcode = 'P0002'; end if;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, case when coalesce(p_active, true) then 'whoami-category-show' else 'whoami-category-hide' end, p_id, left(label, 120));
end;
$$;

-- Staff categories only (built-in ones can be hidden). Deletes softly with all its entries and returns the
-- picture paths the app then removes from storage.
create or replace function public.admin_whoami_delete_category(p_id text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  old public.whoami_categories;
  paths text[];
  removed integer;
begin
  select * into old from public.whoami_categories where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Ангилал олдсонгүй.' using errcode = 'P0002'; end if;
  if old.built_in then raise exception 'Үндсэн ангиллыг устгах боломжгүй. Нууж болно.' using errcode = 'P0001'; end if;
  select coalesce(array_agg(image_path) filter (where image_path is not null), '{}'::text[]), count(*)
  into paths, removed
  from public.whoami_entries where category = p_id and deleted_at is null;
  update public.whoami_entries set deleted_at = now(), active = false, image_path = null, updated_by = me, updated_at = now()
  where category = p_id and deleted_at is null;
  update public.whoami_categories set deleted_at = now(), active = false, updated_by = me, updated_at = now() where id = p_id;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'whoami-category-delete', p_id, left(old.name || ' · ' || removed || ' дүр', 120));
  return paths;
end;
$$;

-- ---------- staff: entries ----------

-- Returns the new entry's id (`<category>-<8 hex>`). A spelling another live entry already uses is refused.
create or replace function public.admin_whoami_add_entry(p_category text, p_name text, p_name_en text default null, p_aliases text[] default '{}')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  clean_name text := public.whoami_clean(p_name);
  clean_en text := public.whoami_clean(p_name_en);
  label text;
  new_id text;
begin
  select name into label from public.whoami_categories where id = p_category and deleted_at is null;
  if not found then raise exception 'Ангилал олдсонгүй.' using errcode = 'P0002'; end if;
  perform public.whoami_check_name(clean_name, false);
  if clean_en is not null then perform public.whoami_check_name(clean_en, true); end if;
  loop
    new_id := p_category || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    exit when not exists (select 1 from public.whoami_entries where id = new_id);
  end loop;
  insert into public.whoami_entries (id, category, name, name_en, aliases, created_by, updated_by)
  values (new_id, p_category, clean_name, clean_en, public.whoami_clean_aliases(p_aliases, clean_name, clean_en), me, me);
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'whoami-entry-add', new_id, left(label || ' · ' || clean_name, 120));
  return new_id;
end;
$$;

create or replace function public.admin_whoami_update_entry(p_id text, p_name text, p_name_en text, p_aliases text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  clean_name text := public.whoami_clean(p_name);
  clean_en text := public.whoami_clean(p_name_en);
  old public.whoami_entries;
begin
  select * into old from public.whoami_entries where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Дүр олдсонгүй.' using errcode = 'P0002'; end if;
  perform public.whoami_check_name(clean_name, false);
  if clean_en is not null then perform public.whoami_check_name(clean_en, true); end if;
  update public.whoami_entries
  set name = clean_name, name_en = clean_en, aliases = public.whoami_clean_aliases(p_aliases, clean_name, clean_en),
    updated_by = me, updated_at = now()
  where id = p_id;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'whoami-entry-edit', p_id, left(old.name || case when old.name <> clean_name then ' → ' || clean_name else '' end, 120));
end;
$$;

create or replace function public.admin_whoami_set_entry_active(p_id text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  label text;
begin
  update public.whoami_entries set active = coalesce(p_active, true), updated_by = me, updated_at = now()
  where id = p_id and deleted_at is null
  returning name into label;
  if not found then raise exception 'Дүр олдсонгүй.' using errcode = 'P0002'; end if;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, case when coalesce(p_active, true) then 'whoami-entry-show' else 'whoami-entry-hide' end, p_id, left(label, 120));
end;
$$;

-- Staff entries only (built-in ones can be hidden). Deletes softly and returns the picture path to remove.
create or replace function public.admin_whoami_delete_entry(p_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  old public.whoami_entries;
begin
  select * into old from public.whoami_entries where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Дүр олдсонгүй.' using errcode = 'P0002'; end if;
  if old.built_in then raise exception 'Үндсэн дүрийг устгах боломжгүй. Нууж болно.' using errcode = 'P0001'; end if;
  update public.whoami_entries set deleted_at = now(), active = false, image_path = null, updated_by = me, updated_at = now() where id = p_id;
  insert into public.admin_actions (admin_id, action, target, detail) values (me, 'whoami-entry-delete', p_id, left(old.name, 120));
  return old.image_path;
end;
$$;

-- The entry's picture: p_path is the uploaded object (`<entry-id>.<jpg|png|webp>` in the whoami bucket), or
-- null to remove it. Returns the previous path, so the app can delete a file with another extension.
create or replace function public.admin_whoami_set_entry_image(p_id text, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  old public.whoami_entries;
begin
  select * into old from public.whoami_entries where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Дүр олдсонгүй.' using errcode = 'P0002'; end if;
  if p_path is not null then
    if p_path !~ '^[a-z][a-z0-9-]{1,63}\.(jpg|png|webp)$' or split_part(p_path, '.', 1) <> p_id then
      raise exception 'Зургийн нэр буруу байна.' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'whoami' and name = p_path) then
      raise exception 'Зураг олдсонгүй. Дахин хуулна уу.' using errcode = 'P0002';
    end if;
  end if;
  update public.whoami_entries set image_path = p_path, updated_by = me, updated_at = now() where id = p_id;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, case when p_path is null then 'whoami-image-remove' else 'whoami-image-set' end, p_id, left(old.name, 120));
  return old.image_path;
end;
$$;

revoke all on function public.admin_whoami_list(text), public.admin_whoami_add_category(text, text, boolean),
  public.admin_whoami_update_category(text, text, text, boolean), public.admin_whoami_set_category_active(text, boolean),
  public.admin_whoami_delete_category(text), public.admin_whoami_add_entry(text, text, text, text[]),
  public.admin_whoami_update_entry(text, text, text, text[]), public.admin_whoami_set_entry_active(text, boolean),
  public.admin_whoami_delete_entry(text), public.admin_whoami_set_entry_image(text, text) from public, anon;
grant execute on function public.admin_whoami_list(text), public.admin_whoami_add_category(text, text, boolean),
  public.admin_whoami_update_category(text, text, text, boolean), public.admin_whoami_set_category_active(text, boolean),
  public.admin_whoami_delete_category(text), public.admin_whoami_add_entry(text, text, text, text[]),
  public.admin_whoami_update_entry(text, text, text, text[]), public.admin_whoami_set_entry_active(text, boolean),
  public.admin_whoami_delete_entry(text), public.admin_whoami_set_entry_image(text, text) to authenticated;

-- ---------- players and the game server ----------

-- The categories a host can pick in the room settings, with how many active entries each has. Names only:
-- which entry goes to whom is the secret, and that stays on the server.
create or replace function public.whoami_category_list()
returns table (id text, name text, name_en text, kid_safe boolean, sort integer, entries integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.name_en, c.kid_safe, c.sort, count(e.id)::integer
  from public.whoami_categories c
  left join public.whoami_entries e on e.category = c.id and e.active and e.deleted_at is null
  where c.active and c.deleted_at is null
  group by c.id
  order by c.sort, c.id;
$$;
revoke all on function public.whoami_category_list() from public;
grant execute on function public.whoami_category_list() to anon, authenticated, service_role;

-- Everything the game server deals from, in one call: active categories with their active entries.
create or replace function public.whoami_game_pack()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object(
    'id', c.id, 'name', c.name, 'name_en', c.name_en, 'kid_safe', c.kid_safe, 'sort', c.sort,
    'entries', coalesce((
      select json_agg(json_build_object('id', e.id, 'name', e.name, 'name_en', e.name_en, 'aliases', e.aliases,
        'image_path', e.image_path, 'updated_at', e.updated_at) order by e.id)
      from public.whoami_entries e
      where e.category = c.id and e.active and e.deleted_at is null), '[]'::json)
  ) order by c.sort, c.id), '[]'::json)
  from public.whoami_categories c
  where c.active and c.deleted_at is null;
$$;
revoke all on function public.whoami_game_pack() from public, anon, authenticated;
grant execute on function public.whoami_game_pack() to service_role;

-- ---------- pictures ----------

-- Public bucket: anyone can view a picture by its URL; only staff can upload, replace or delete one.
-- The game only puts an entry's picture in a view that is allowed to see the entry's name (see whoAmIEngine.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whoami', 'whoami', true, 307200, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Staff read the bucket too (the storage API checks it when a picture is replaced).
drop policy if exists "Who Am I staff read pictures" on storage.objects;
create policy "Who Am I staff read pictures" on storage.objects
  for select to authenticated
  using (bucket_id = 'whoami' and (select public.staff_role()) is not null);

drop policy if exists "Who Am I staff upload pictures" on storage.objects;
create policy "Who Am I staff upload pictures" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'whoami' and (select public.staff_role()) is not null and name ~ '^[a-z][a-z0-9-]{1,63}\.(jpg|png|webp)$');

drop policy if exists "Who Am I staff replace pictures" on storage.objects;
create policy "Who Am I staff replace pictures" on storage.objects
  for update to authenticated
  using (bucket_id = 'whoami' and (select public.staff_role()) is not null)
  with check (bucket_id = 'whoami' and (select public.staff_role()) is not null and name ~ '^[a-z][a-z0-9-]{1,63}\.(jpg|png|webp)$');

drop policy if exists "Who Am I staff delete pictures" on storage.objects;
create policy "Who Am I staff delete pictures" on storage.objects
  for delete to authenticated
  using (bucket_id = 'whoami' and (select public.staff_role()) is not null);
