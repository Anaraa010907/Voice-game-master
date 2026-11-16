import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronRight, Eye, EyeOff, ImageOff, ImagePlus, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import type { NotifyFn } from './multiplayer';
import { isEnglish, t } from './lang';
import { translateMessage } from './i18n';
import { MIN_CATEGORY_ENTRIES, refreshWhoAmICategories, whoAmIImageUrl } from './whoAmICatalog';
import { formatKb, prepareWhoAmIPicture, removeWhoAmIPictures, uploadWhoAmIPicture, type PreparedPicture } from './whoAmIImage';

/*
 * Admin panel → "Би хэн бэ": staff (admins and moderators) manage the game's content.
 *   Categories: add, rename (and the kid-friendly flag), hide / show, delete (staff-made ones only).
 *   Entries in a category: add, edit (Mongolian and English names, alternative spellings), hide / show,
 *   delete (staff-made ones only), and one picture each (shrunk on the phone to at most 300 KB).
 * Built-in rows (the pack the game shipped with) can be edited and hidden but not deleted. Every change goes
 * through the admin_whoami_* database functions, which check the staff role and write the audit log.
 * A running table keeps the identities it dealt, so nothing here changes a game in progress.
 */

type Category = {
  id: string; name: string; name_en: string; kid_safe: boolean; active: boolean; built_in: boolean; sort: number; updated_at: string;
  entries: number; active_entries: number; images: number;
};
type Entry = {
  id: string; category: string; name: string; name_en: string | null; aliases: string[]; image_path: string | null;
  active: boolean; built_in: boolean; updated_at: string;
};
type Listing = { min_entries: number; categories: Category[]; entries: Entry[] };
type Confirm = { kind: 'category' | 'entry'; id: string; name: string };

const failure = (error: { message?: string } | null | undefined) => (error?.message ? translateMessage(error.message) : '') || t('Алдаа гарлаа. Дахин оролдоно уу.', 'Something went wrong. Please try again.');
const thrown = (cause: unknown) => (cause instanceof Error ? translateMessage(cause.message) : '') || failure(null);
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const pictureOf = (entry: Entry) => entry.image_path ? whoAmIImageUrl(SUPABASE_URL, entry.image_path, entry.updated_at) : null;
const label = (item: { name: string; name_en: string | null }) => isEnglish && item.name_en ? item.name_en : item.name;
const sortByName = (a: Entry, b: Entry) => label(a).localeCompare(label(b), isEnglish ? 'en' : 'mn');
/** Comma- or line-separated spellings, as typed. The database trims them and drops repeats. */
const splitAliases = (value: string) => value.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);

export function WhoAmIContentTab({ notify }: { notify: NotifyFn }) {
  const [data, setData] = useState<Listing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<Category | 'new' | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    // '' lists the categories only; a category id adds its entries.
    const { data: result, error } = await supabase.rpc('admin_whoami_list', { p_category: openId ?? '' });
    if (error) { notify(failure(error), 'error'); return; }
    setData(result as Listing);
  }, [notify, openId]);
  useEffect(() => { void load(); }, [load]);

  const minimum = data?.min_entries ?? MIN_CATEGORY_ENTRIES;
  const open = data?.categories.find((category) => category.id === openId) ?? null;
  const entries = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = (data?.entries ?? []).filter((entry) => entry.category === openId);
    return (needle ? list.filter((entry) => [entry.name, entry.name_en ?? '', ...entry.aliases].some((name) => name.toLowerCase().includes(needle))) : list).sort(sortByName);
  }, [data, openId, filter]);

  /** Runs one change, then reloads the list (and the room rules' category list). */
  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const message = await work();
      if (message) notify(message, 'success');
      await load();
      void refreshWhoAmICategories(true);
      return true;
    } catch (cause) {
      notify(thrown(cause), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const rpc = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
    if (!supabase) throw new Error(t('Сервер тохируулагдаагүй байна.', 'The server is not set up.'));
    const { data: result, error } = await supabase.rpc(name, args);
    if (error) throw new Error(failure(error));
    return result as T;
  };

  const toggleCategory = (category: Category) => run(async () => {
    const hiding = category.active;
    await rpc('admin_whoami_set_category_active', { p_id: category.id, p_active: !hiding });
    return hiding ? t(`«${category.name}» нуугдлаа. Шинэ тоглолтод гарахгүй.`, `“${category.name_en}” is hidden. New games won’t use it.`) : t(`«${category.name}» дахин харагдана.`, `“${category.name_en}” is shown again.`);
  });
  const toggleEntry = (entry: Entry) => run(async () => {
    const hiding = entry.active;
    await rpc('admin_whoami_set_entry_active', { p_id: entry.id, p_active: !hiding });
    return hiding ? t(`«${entry.name}» нуугдлаа.`, `“${label(entry)}” is hidden.`) : t(`«${entry.name}» дахин харагдана.`, `“${label(entry)}” is shown again.`);
  });
  const remove = (target: Confirm) => run(async () => {
    if (target.kind === 'category') {
      const paths = await rpc<string[] | null>('admin_whoami_delete_category', { p_id: target.id });
      await removeWhoAmIPictures(paths ?? []);
      if (openId === target.id) setOpenId(null);
    } else {
      const path = await rpc<string | null>('admin_whoami_delete_entry', { p_id: target.id });
      await removeWhoAmIPictures([path]);
    }
    setConfirm(null);
    return t(`«${target.name}» устлаа.`, `“${target.name}” was deleted.`);
  });

  const confirmRow = (target: Confirm) => <span className="admin-confirm whoami-admin-confirm">
    <button type="button" className="danger-button" disabled={busy} onClick={() => void remove(target)}><Trash2 size={13} />{t(` ТИЙМ, УСТГАХ`, ` YES, DELETE`)}</button>
    <button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label={t('Болих', 'Cancel')}><X size={14} /></button>
  </span>;
  const hideButton = (active: boolean, onClick: () => void, name: string) => <button type="button" className="secondary-button whoami-admin-icon" disabled={busy} onClick={onClick}
    aria-label={active ? t(`${name}: нуух`, `Hide ${name}`) : t(`${name}: харуулах`, `Show ${name}`)} title={active ? t('Нуух', 'Hide') : t('Харуулах', 'Show')}>
    {active ? <Eye size={15} /> : <EyeOff size={15} />}</button>;

  if (!data) return <div className="admin-pane"><p className="panel-empty">{t(`Ачаалж байна…`, `Loading…`)}</p></div>;

  // ---------- one category: its entries ----------
  if (open) {
    const playable = open.active && open.active_entries >= minimum;
    return <div className="admin-pane whoami-admin">
      <div className="whoami-admin-head">
        <button type="button" className="secondary-button whoami-admin-back" onClick={() => { setOpenId(null); setFilter(''); setConfirm(null); }}><ArrowLeft size={14} />{t(` АНГИЛЛУУД`, ` CATEGORIES`)}</button>
        <span className="whoami-admin-title"><b>{isEnglish ? open.name_en : open.name}</b><small>{isEnglish ? open.name : open.name_en}</small></span>
        <button type="button" className="secondary-button whoami-admin-icon" disabled={busy} onClick={() => setEditCategory(open)} aria-label={t('Ангиллыг засах', 'Edit category')} title={t('Засах', 'Edit')}><Pencil size={15} /></button>
        {hideButton(open.active, () => void toggleCategory(open), open.name)}
      </div>
      <p className={`admin-note ${playable ? '' : 'is-warning'}`}>{playable
        ? t(`${open.active_entries} идэвхтэй дүр · ${open.images} зурагтай. Шинэ тоглолтод гарна.`, `${open.active_entries} active entries · ${open.images} with pictures. Used in new games.`)
        : !open.active ? t('Энэ ангилал нуугдсан: шинэ тоглолтод гарахгүй.', 'This category is hidden: new games won’t use it.')
          : t(`Тоглоомд гарахын тулд дор хаяж ${minimum} идэвхтэй дүр хэрэгтэй (одоо ${open.active_entries}).`, `It needs at least ${minimum} active entries to be used in games (now ${open.active_entries}).`)}</p>
      <div className="whoami-admin-tools">
        <label className="admin-search whoami-admin-search"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('Дүр хайх', 'Find an entry')} aria-label={t('Дүр хайх', 'Find an entry')} /></label>
        <button type="button" className="primary-button whoami-admin-add" disabled={busy} onClick={() => setEditEntry('new')}><Plus size={15} />{t(` ДҮР`, ` ENTRY`)}</button>
      </div>
      {entries.length === 0 && <p className="panel-empty">{filter ? t('Олдсонгүй.', 'Nothing found.') : t('Одоогоор дүр алга. «+ ДҮР» дарж нэмнэ үү.', 'No entries yet. Tap “+ ENTRY” to add one.')}</p>}
      <ul className="admin-list whoami-admin-list">
        {entries.map((entry) => {
          const picture = pictureOf(entry);
          return <li key={entry.id} className={entry.active ? '' : 'is-hidden'}>
            <button type="button" className="whoami-admin-entry" onClick={() => setEditEntry(entry)} aria-label={t(`${entry.name} засах`, `Edit ${label(entry)}`)}>
              <span className="whoami-admin-thumb">{picture ? <img src={picture} alt="" loading="lazy" decoding="async" /> : <ImagePlus size={16} />}</span>
              <span className="admin-row-main">
                <b>{label(entry)}
                  {!entry.active && <span className="chip chip-red">{t('НУУСАН', 'HIDDEN')}</span>}
                  {entry.built_in && <span className="chip">{t('ҮНДСЭН', 'BUILT-IN')}</span>}</b>
                <small>{[isEnglish ? entry.name : entry.name_en, ...entry.aliases].filter(Boolean).join(' · ') || t('Англи нэргүй', 'No English name')}</small>
              </span>
            </button>
            <span className="admin-row-actions">
              {hideButton(entry.active, () => void toggleEntry(entry), entry.name)}
              {!entry.built_in && (confirm?.kind === 'entry' && confirm.id === entry.id ? confirmRow(confirm)
                : <button type="button" className="secondary-button whoami-admin-icon" disabled={busy} onClick={() => setConfirm({ kind: 'entry', id: entry.id, name: label(entry) })} aria-label={t(`${entry.name} устгах`, `Delete ${label(entry)}`)} title={t('Устгах', 'Delete')}><Trash2 size={15} /></button>)}
            </span>
          </li>;
        })}
      </ul>
      {editCategory && <CategoryDialog category={editCategory === 'new' ? null : editCategory} busy={busy} onClose={() => setEditCategory(null)} onSave={(fields) => run(async () => {
        await rpc('admin_whoami_update_category', { p_id: open.id, p_name: fields.name, p_name_en: fields.nameEn, p_kid_safe: fields.kidSafe });
        setEditCategory(null);
        return t('Ангилал хадгалагдлаа.', 'Category saved.');
      })} />}
      {editEntry && <EntryDialog entry={editEntry === 'new' ? null : editEntry} categoryName={isEnglish ? open.name_en : open.name} busy={busy} onClose={() => setEditEntry(null)}
        onSave={(fields) => run(async () => {
          const entry = editEntry === 'new' ? null : editEntry;
          const aliases = splitAliases(fields.aliases);
          const id = entry
            ? (await rpc('admin_whoami_update_entry', { p_id: entry.id, p_name: fields.name, p_name_en: fields.nameEn || null, p_aliases: aliases }), entry.id)
            : await rpc<string>('admin_whoami_add_entry', { p_category: open.id, p_name: fields.name, p_name_en: fields.nameEn || null, p_aliases: aliases });
          let note = '';
          if (fields.picture) {
            try {
              const path = await uploadWhoAmIPicture(id, fields.picture);
              const previous = await rpc<string | null>('admin_whoami_set_entry_image', { p_id: id, p_path: path });
              if (previous && previous !== path) await removeWhoAmIPictures([previous]);
            } catch (cause) {
              note = ` ${thrown(cause)}`;
            }
          } else if (fields.removePicture && entry?.image_path) {
            const previous = await rpc<string | null>('admin_whoami_set_entry_image', { p_id: id, p_path: null });
            await removeWhoAmIPictures([previous]);
          }
          setEditEntry(null);
          return (entry ? t('Дүр хадгалагдлаа.', 'Entry saved.') : t(`«${fields.name}» нэмэгдлээ.`, `“${fields.nameEn || fields.name}” was added.`)) + note;
        })} />}
    </div>;
  }

  // ---------- every category ----------
  return <div className="admin-pane whoami-admin">
    <div className="whoami-admin-head">
      <span className="admin-pane-title">{t(`Би хэн бэ · ангиллууд`, `Who Am I · categories`)}</span>
      <button type="button" className="icon-button admin-refresh" onClick={() => void load()} aria-label={t('Шинэчлэх', 'Refresh')}><RefreshCw size={14} /></button>
      <button type="button" className="primary-button whoami-admin-add" disabled={busy} onClick={() => setEditCategory('new')}><Plus size={15} />{t(` АНГИЛАЛ`, ` CATEGORY`)}</button>
    </div>
    <p className="admin-note">{t(`Ангилал тоглоомд гарахын тулд ${minimum}+ идэвхтэй дүртэй байна. Үндсэн ангилал, дүрийг засаж, нууж болно, устгахгүй. Өөрчлөлт шинэ тоглолтоос эхэлж үйлчилнэ.`, `A category needs ${minimum}+ active entries to be used. Built-in categories and entries can be edited and hidden, not deleted. Changes apply from the next game.`)}</p>
    <ul className="admin-list whoami-admin-list">
      {data.categories.map((category) => {
        const short = category.active_entries < minimum;
        return <li key={category.id} className={category.active ? '' : 'is-hidden'}>
          <button type="button" className="whoami-admin-entry" onClick={() => { setOpenId(category.id); setConfirm(null); }} aria-label={t(`${category.name}: дүрүүд`, `${category.name_en}: entries`)}>
            <span className="admin-row-main">
              <b>{isEnglish ? category.name_en : category.name}
                {!category.active && <span className="chip chip-red">{t('НУУСАН', 'HIDDEN')}</span>}
                {category.active && short && <span className="chip chip-red">{t(`${minimum}-аас цөөн`, `under ${minimum}`)}</span>}
                {!category.kid_safe && <span className="chip chip-blue">{t('ТОМ ХҮН', 'ADULTS')}</span>}
                {category.built_in && <span className="chip">{t('ҮНДСЭН', 'BUILT-IN')}</span>}</b>
              <small>{isEnglish ? category.name : category.name_en} · {t(`${category.active_entries}/${category.entries} дүр идэвхтэй · ${category.images} зураг`, `${category.active_entries}/${category.entries} entries active · ${category.images} pictures`)}</small>
            </span>
            <ChevronRight size={16} className="whoami-admin-chevron" />
          </button>
          <span className="admin-row-actions">
            <button type="button" className="secondary-button whoami-admin-icon" disabled={busy} onClick={() => setEditCategory(category)} aria-label={t(`${category.name} засах`, `Edit ${category.name_en}`)} title={t('Засах', 'Edit')}><Pencil size={15} /></button>
            {hideButton(category.active, () => void toggleCategory(category), category.name)}
            {!category.built_in && (confirm?.kind === 'category' && confirm.id === category.id ? confirmRow(confirm)
              : <button type="button" className="secondary-button whoami-admin-icon" disabled={busy} onClick={() => setConfirm({ kind: 'category', id: category.id, name: isEnglish ? category.name_en : category.name })} aria-label={t(`${category.name} устгах`, `Delete ${category.name_en}`)} title={t('Устгах', 'Delete')}><Trash2 size={15} /></button>)}
          </span>
        </li>;
      })}
    </ul>
    {editCategory && <CategoryDialog category={editCategory === 'new' ? null : editCategory} busy={busy} onClose={() => setEditCategory(null)} onSave={(fields) => run(async () => {
      if (editCategory === 'new') {
        const id = await rpc<string>('admin_whoami_add_category', { p_name: fields.name, p_name_en: fields.nameEn, p_kid_safe: fields.kidSafe });
        setEditCategory(null);
        setOpenId(id);
        return t(`«${fields.name}» ангилал нэмэгдлээ. Одоо дүрүүдээ нэмнэ үү.`, `“${fields.nameEn}” was added. Now add its entries.`);
      }
      await rpc('admin_whoami_update_category', { p_id: editCategory.id, p_name: fields.name, p_name_en: fields.nameEn, p_kid_safe: fields.kidSafe });
      setEditCategory(null);
      return t('Ангилал хадгалагдлаа.', 'Category saved.');
    })} />}
  </div>;
}

type CategoryFields = { name: string; nameEn: string; kidSafe: boolean };

function CategoryDialog({ category, busy, onClose, onSave }: { category: Category | null; busy: boolean; onClose: () => void; onSave: (fields: CategoryFields) => Promise<boolean> }) {
  const [name, setName] = useState(category?.name ?? '');
  const [nameEn, setNameEn] = useState(category?.name_en ?? '');
  const [kidSafe, setKidSafe] = useState(category?.kid_safe ?? true);
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave({ name: name.trim(), nameEn: nameEn.trim(), kidSafe }); };
  return <div className="game-modal-backdrop" onClick={onClose}>
    <form className="game-modal admin-ban-modal whoami-admin-modal" role="dialog" aria-modal="true" aria-labelledby="wa-category-title" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
      <header><h2 id="wa-category-title">{category ? t('Ангилал засах', 'Edit category') : t('Шинэ ангилал', 'New category')}</h2>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button>
          <button type="submit" className="primary-button" disabled={busy || !name.trim() || !nameEn.trim()}><Check size={14} />{t(` ХАДГАЛАХ`, ` SAVE`)}</button>
        </div></header>
      <div className="whoami-admin-fields">
        <label className="auth-field"><span>{t(`МОНГОЛ НЭР`, `MONGOLIAN NAME`)}</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder={t('Жишээ нь: Хүүхэлдэйн кино', 'For example: Хүүхэлдэйн кино')} autoFocus={!category} /></label>
        <label className="auth-field"><span>{t(`АНГЛИ НЭР`, `ENGLISH NAME`)}</span><input value={nameEn} maxLength={40} onChange={(event) => setNameEn(event.target.value)} placeholder={t('Жишээ нь: Cartoons', 'For example: Cartoons')} /></label>
      </div>
      <div className="admin-choice-row" role="radiogroup" aria-label={t('Хэнд тохирох', 'Audience')}>
        <button type="button" role="radio" aria-checked={kidSafe} className={kidSafe ? 'is-picked' : ''} onClick={() => setKidSafe(true)}>{t('Хүүхдэд тохиромжтой', 'Kid-friendly')}</button>
        <button type="button" role="radio" aria-checked={!kidSafe} className={!kidSafe ? 'is-picked' : ''} onClick={() => setKidSafe(false)}>{t('Зөвхөн том хүнд', 'Adults only')}</button>
      </div>
    </form>
  </div>;
}

type EntryFields = { name: string; nameEn: string; aliases: string; picture: PreparedPicture | null; removePicture: boolean };

function EntryDialog({ entry, categoryName, busy, onClose, onSave }: { entry: Entry | null; categoryName: string; busy: boolean; onClose: () => void; onSave: (fields: EntryFields) => Promise<boolean> }) {
  const [name, setName] = useState(entry?.name ?? '');
  const [nameEn, setNameEn] = useState(entry?.name_en ?? '');
  const [aliases, setAliases] = useState((entry?.aliases ?? []).join(', '));
  const [picture, setPicture] = useState<PreparedPicture | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePicture, setRemovePicture] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const current = entry && !removePicture ? pictureOf(entry) : null;
  const shown = preview ?? current;
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true); setProblem('');
    try {
      const prepared = await prepareWhoAmIPicture(file);
      setPicture(prepared);
      setPreview(URL.createObjectURL(prepared.blob));
      setRemovePicture(false);
    } catch (cause) {
      setProblem(thrown(cause));
    } finally {
      setPreparing(false);
    }
  };
  const clearPicture = () => { setPicture(null); setPreview(null); setRemovePicture(Boolean(entry?.image_path)); };
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave({ name: name.trim(), nameEn: nameEn.trim(), aliases, picture, removePicture }); };

  return <div className="game-modal-backdrop" onClick={onClose}>
    <form className="game-modal admin-ban-modal whoami-admin-modal is-entry" role="dialog" aria-modal="true" aria-labelledby="wa-entry-title" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
      {/* Save and cancel sit in the header, so they stay on screen on a 340 px tall phone. */}
      <header><h2 id="wa-entry-title">{entry ? t('Дүр засах', 'Edit entry') : t('Шинэ дүр', 'New entry')} <small>· {categoryName}</small></h2>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t(`БОЛИХ`, `CANCEL`)}</button>
          <button type="submit" className="primary-button" disabled={busy || preparing || !name.trim()}><Check size={14} />{entry ? t(` ХАДГАЛАХ`, ` SAVE`) : t(` НЭМЭХ`, ` ADD`)}</button>
        </div></header>
      <div className="whoami-admin-entry-form">
        <div className="whoami-admin-picture">
          <span className="whoami-admin-preview">{shown ? <img src={shown} alt="" /> : <ImagePlus size={22} />}</span>
          <label className={`secondary-button whoami-admin-pick ${preparing ? 'is-busy' : ''}`}>
            <ImagePlus size={14} />{preparing ? t(' БАГАСГАЖ БАЙНА…', ' SHRINKING…') : shown ? t(' СОЛИХ', ' REPLACE') : t(' ЗУРАГ', ' PICTURE')}
            <input type="file" accept="image/*" disabled={preparing || busy} onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          {shown && <button type="button" className="secondary-button whoami-admin-pick" disabled={busy} onClick={clearPicture}><ImageOff size={14} />{t(' АВАХ', ' REMOVE')}</button>}
          <small>{picture ? t(`Шинэ зураг · ${formatKb(picture.blob.size)}`, `New picture · ${formatKb(picture.blob.size)}`) : removePicture ? t('Хадгалахад зураг авагдана', 'The picture goes when you save') : t('Заавал биш · 300 KB хүртэл шахна', 'Optional · shrunk to 300 KB')}</small>
        </div>
        <div className="whoami-admin-fields">
          <label className="auth-field"><span>{t(`МОНГОЛ НЭР`, `MONGOLIAN NAME`)}</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder={t('Жишээ нь: Шилүүс', 'For example: Шилүүс')} autoFocus={!entry} /></label>
          <label className="auth-field"><span>{t(`АНГЛИ НЭР (заавал биш)`, `ENGLISH NAME (optional)`)}</span><input value={nameEn} maxLength={40} onChange={(event) => setNameEn(event.target.value)} placeholder={t('Жишээ нь: Lynx', 'For example: Lynx')} /></label>
          <label className="auth-field"><span>{t(`ӨӨР НЭРС (таслалаар, 8 хүртэл)`, `OTHER SPELLINGS (comma-separated, up to 8)`)}</span><input value={aliases} maxLength={360} onChange={(event) => setAliases(event.target.value)} placeholder={t('Жишээ нь: шилүүс муур, ирвэс муур', 'For example: шилүүс муур, ирвэс муур')} /></label>
        </div>
      </div>
      {problem && <p className="admin-note is-warning" role="alert">{problem}</p>}
      <p className="admin-note">{t('Бичиж таахад нэр, англи нэр, өөр нэрс бүгд зөв тооцогдоно. Өөр дүрд байгаа нэрийг давхар өгөх боломжгүй.', 'A typed guess counts if it matches the name, the English name or any other spelling. A spelling another entry already uses is refused.')}</p>
    </form>
  </div>;
}
