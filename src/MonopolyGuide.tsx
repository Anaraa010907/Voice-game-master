import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight, Building2, ChevronLeft, ChevronRight, Coins, Dices, Gavel, HandCoins, Landmark, Lock, PartyPopper, Plane,
  Plug, Sparkles, Trophy, Waves, X,
} from 'lucide-react';
import {
  JAIL_FINE, MAX_OFFERS_PER_TURN, PASS_START_BONUS, sanitizeMonopolySettings, type MonopolySettings,
} from './monopolyEngine';

const money = (value: number) => `${value.toLocaleString('en-US')}₮`;

type Page = { key: string; title: string; art: ReactNode; body: ReactNode };

/** A little deed card, drawn like a board tile. */
function Deed({ group, name, price, rent }: { group: string; name: string; price: number; rent?: string }) {
  return <span className={`guide-deed group-${group}`}><i /><b>{name}</b><small>{money(price)}</small>{rent && <em>{rent}</em>}</span>;
}

function Pip({ value }: { value: number }) {
  const on: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  return <span className="guide-die">{Array.from({ length: 9 }, (_, cell) => <i key={cell} className={on[value].includes(cell + 1) ? 'on' : ''} />)}</span>;
}

function pages(rules: MonopolySettings | null): Page[] {
  const auction = rules ? rules.auction : true;
  const doubleRent = rules ? rules.doubleRent : true;
  const vacation = rules ? rules.vacationCash : true;
  const mortgage = rules ? rules.mortgage : true;
  const evenBuild = rules ? rules.evenBuild : true;
  const list: Page[] = [
    {
      key: 'goal', title: 'Зорилго',
      art: <div className="guide-art-stack"><Trophy size={44} /><span className="guide-coin-row"><Coins size={16} /><Coins size={16} /><Coins size={16} /></span></div>,
      body: <>
        <p>Монгол нутгийн газрууд худалдаж аваад, бусад тоглогчоос <b>түрээс</b> ав. Мөнгөгүй болсон тоглогч <b>дампуурч</b> тоглоомоос гарна.</p>
        <p><b>Хамгийн сүүлд үлдсэн тоглогч ялна.</b> {rules?.rounds ? `Энэ өрөөнд ${rules.rounds} тойргийн дараа хамгийн их хөрөнгөтэй нь ялна.` : 'Тойргийн хязгаартай өрөөнд хязгаар дуусахад хамгийн их хөрөнгөтэй нь ялна.'}</p>
        <p className="guide-note">Тоглогч бүр {money(rules?.startingCash ?? 1500)}-тэй эхэлнэ.</p>
      </>,
    },
    {
      key: 'turn', title: 'Ээлж',
      art: <div className="guide-art-stack"><span className="guide-dice"><Pip value={4} /><Pip value={4} /></span><span className="guide-tag">ХОС = ДАХИН</span></div>,
      body: <>
        <p>Ээлжээрээ <b>ШОО ХАЯХ</b> товчийг дарна. Хоёр шооны нийлбэрээр таны дүрс цагийн зүүний дагуу алхана.</p>
        <p><b>Хос</b> (хоёр ижил тоо) буувал дахин хаяна. Гурван удаа дараалан хос буувал шууд шоронд орно.</p>
        <p><b>Эхлэл</b>-ийг давах бүрт банкнаас {money(PASS_START_BONUS)} авна.</p>
      </>,
    },
    {
      key: 'buy', title: 'Газар худалдаж авах',
      art: <div className="guide-art-stack"><Deed group="orange" name="Цэцэрлэг" price={200} /><HandCoins size={26} /></div>,
      body: <>
        <p>Эзэнгүй газар, нисэх буудал, өртөө эсвэл станц дээр буувал үнээр нь <b>худалдаж авч</b> болно.</p>
        {auction
          ? <p>Авахгүй бол газар <b>дуудлага худалдаанд</b> гарна. Ээлжээрээ үнэ нэмж хаяна, өнжсөн хүн дахин оролцохгүй. Хамгийн өндөр үнэ хаясан нь авна.</p>
          : <p>Авахгүй бол газар эзэнгүй хэвээр үлдэж, дараа нь буусан хүн авч болно.</p>}
      </>,
    },
    {
      key: 'rent', title: 'Түрээс',
      art: <div className="guide-art-stack guide-set"><Deed group="red" name="Өндөрхаан" price={220} rent="18₮" /><Deed group="red" name="Дадал" price={220} rent="18₮" /><Deed group="red" name="Хархорин" price={240} rent="20₮" /></div>,
      body: <>
        <p>Бусдын газар дээр буувал эзэнд нь <b>түрээс</b> төлнө. Барьцаалсан газарт түрээс төлөхгүй.</p>
        {doubleRent && <p>Нэг <b>өнгийн бүх газрыг</b> эзэмшвэл гэргүй ч түрээс нь <b>2 дахин</b> өснө.</p>}
        <p><Plane size={12} /> Нисэх буудал, өртөө, боомт: эзэмшсэн тоогоороо 25₮ → 50₮ → 100₮ → 200₮.<br /><Plug size={12} /> <Waves size={12} /> Станц, ус суваг: шооны нийлбэр ×4, хоёуланг нь эзэмшвэл ×10.</p>
      </>,
    },
    {
      key: 'build', title: 'Гэр, жуулчны бааз',
      art: <div className="guide-art-stack"><span className="guide-houses"><i /><i /><i /><i /></span><ChevronRight size={18} /><span className="guide-hotel"><Building2 size={22} /></span></div>,
      body: <>
        <p>Нэг өнгийн бүх газраа бүрдүүлсний дараа өөрийн ээлжээр газар дээрээ дарж <b>гэр барина</b>. Гэр бүр түрээсийг огцом өсгөнө.</p>
        {evenBuild && <p>Гэрийг <b>тэгш</b> барина: бүлгийн газар бүрт нэг нэгээр нэмнэ.</p>}
        <p>4 гэрийн дараа <b>жуулчны бааз</b> барина — хамгийн өндөр түрээс. Гэрээ хагас үнээр нь банкинд буцааж зарж болно.</p>
      </>,
    },
    {
      key: 'tiles', title: 'Тусгай нүднүүд',
      art: <div className="guide-art-stack"><span className="guide-icon-grid"><Sparkles size={18} /><Coins size={18} /><Landmark size={18} /><PartyPopper size={18} /><Lock size={18} /><Gavel size={18} /></span></div>,
      body: <ul className="guide-list">
        <li><Sparkles size={12} /><b>Хувь тавилан</b>, <Coins size={12} /><b>Эрдэнэсийн авдар</b> — карт сугалж, бичсэнийг нь хийнэ.</li>
        <li><Landmark size={12} /><b>Орлогын татвар</b> — бэлэн мөнгөнийхөө 10%. <b>Тансгийн татвар</b> — 75₮.</li>
        <li><PartyPopper size={12} /><b>Наадмын амралт</b> — {vacation ? 'татвар, торгууль энд хуримтлагдана; энд буусан хүн бүгдийг нь авна.' : 'амралт, юу ч болохгүй.'}</li>
        <li><Gavel size={12} /><b>Шоронд яв</b> — шууд шоронд очно, Эхлэлийг давсанд тооцохгүй.</li>
      </ul>,
    },
    {
      key: 'jail', title: 'Шорон',
      art: <div className="guide-art-stack"><span className="guide-bars"><Lock size={30} /></span><span className="guide-tag">{money(JAIL_FINE)}</span></div>,
      body: <>
        <p>Шоронд орсон бол гарах гурван арга бий: <b>хос буулгах</b> (гурван оролдлого), <b>{money(JAIL_FINE)} торгууль</b> төлөх эсвэл <b>«Өршөөл»</b> картаа ашиглах.</p>
        <p>Гурав дахь оролдлогоор хос буухгүй бол торгуулиа төлж гарна.{rules?.prisonNoRent ? ' Энэ өрөөнд шоронд байх хугацаандаа түрээс авахгүй.' : ' Шоронд байхдаа ч газрынхаа түрээсийг авна.'}</p>
        <p className="guide-note">«Шорон» нүдэн дээр зүгээр буувал зочилж байгаа гэсэн үг, юу ч болохгүй.</p>
      </>,
    },
    {
      key: 'cash', title: 'Мөнгө дутвал',
      art: <div className="guide-art-stack"><Deed group="green" name="Эрдэнэт" price={300} rent={mortgage ? 'барьцаа +150₮' : undefined} /></div>,
      body: <>
        <p>Төлөх мөнгө хүрэлцэхгүй бол гэрээ зарж{mortgage ? <>, газраа <b>барьцаалж</b> (үнийн тал) мөнгө олно. Барьцаагаа 10% хүүтэй буцааж гаргана</> : ' мөнгө олно'}. Бусадтай арилжаа хийж ч болно.</p>
        <p>Тэгээд ч төлж чадахгүй бол <b>дампуурна</b>: өмч тань өртэй тоглогчид (эсвэл банкинд) очиж, та тоглоомоос гарна.</p>
      </>,
    },
    {
      key: 'trade', title: 'Арилжаа',
      art: <div className="guide-art-stack guide-trade"><Deed group="sky" name="Мөрөн" price={100} /><ArrowLeftRight size={22} /><Deed group="sky" name="Улиастай" price={120} /></div>,
      body: <>
        <p><b>АРИЛЖАА</b> товчоор өөр тоглогчид газар, мөнгө, шоронгийн карт солилцох санал илгээнэ. Нөгөө тал нь зөвшөөрөх эсвэл татгалзана.</p>
        <p>Нэг ээлжид {MAX_OFFERS_PER_TURN} хүртэл санал тавина. Барилгатай бүлгийн газрыг арилжаалахгүй. Бүлгээ бүрдүүлэх хамгийн хурдан арга!</p>
      </>,
    },
    {
      key: 'tips', title: 'Зөвлөмж',
      art: <div className="guide-art-stack guide-set"><Deed group="orange" name="Баянхонгор" price={180} /><Deed group="red" name="Өндөрхаан" price={220} /></div>,
      body: <ul className="guide-list">
        <li><b>Улбар шар, улаан</b> газрууд шоронгийн дараа хамгийн олон буудаг — авах нь ашигтай.</li>
        <li>Эхлээд хямд бүлгээ бүрдүүлж, <b>3 гэр</b> хүртэл барь: түрээс хамгийн их өсдөг.</li>
        <li>Бэлэн мөнгө бага зэрэг үлдээ — гэнэтийн түрээс, татвар байнга гарна.</li>
        <li>Бусдын бүлгийг бүрдүүлэхэд дутуу газрыг амархан бүү өг.</li>
      </ul>,
    },
  ];
  if (rules) {
    const flags: Array<[string, boolean]> = [
      ['Бүлгээрээ 2 дахин түрээс', rules.doubleRent], ['Наадмын сан', rules.vacationCash], ['Дуудлага худалдаа', rules.auction],
      ['Шоронд түрээс авахгүй', rules.prisonNoRent], ['Барьцаа', rules.mortgage], ['Тэгш барих', rules.evenBuild],
    ];
    list.push({
      key: 'room', title: 'Энэ өрөөний дүрэм',
      art: <div className="guide-art-stack"><span className="guide-tag is-big">{money(rules.startingCash)}</span><span className="guide-tag">{rules.rounds ? `${rules.rounds} ТОЙРОГ` : 'ДАМПУУРТАЛ'}</span></div>,
      body: <ul className="guide-flags">{flags.map(([label, on]) => <li key={label} className={on ? 'is-on' : ''}><span>{on ? 'ТИЙМ' : 'ҮГҮЙ'}</span>{label}</li>)}</ul>,
    });
  }
  return list;
}

/** How to play the board game, one short page at a time. `settings` adds the room's own rules. */
export function MonopolyGuide({ settings, onClose }: { settings?: unknown; onClose: () => void }) {
  const rules = settings === undefined ? null : sanitizeMonopolySettings(settings);
  const list = pages(rules);
  const [index, setIndex] = useState(0);
  const page = list[Math.min(index, list.length - 1)];
  const last = index >= list.length - 1;
  const tabs = useRef<HTMLElement>(null);
  // Keep the current page's tab in view as the reader moves through the pages.
  useEffect(() => {
    const current = tabs.current?.querySelector<HTMLElement>('.is-current');
    const strip = tabs.current;
    if (current && strip) strip.scrollTo({ left: current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2, behavior: 'smooth' });
  }, [index]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(value + 1, list.length - 1));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(value - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length, onClose]);
  return <div className="game-modal-backdrop guide-backdrop" onClick={onClose}>
    <section className="game-modal mono-guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(event) => event.stopPropagation()}>
      <header className="mono-guide-head">
        <span className="mono-guide-kicker"><Dices size={13} /> ХЭРХЭН ТОГЛОХ · {index + 1}/{list.length}</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Хаах"><X size={15} /></button>
      </header>
      <nav className="mono-guide-tabs" ref={tabs} aria-label="Зааврын хуудсууд">
        {list.map((entry, at) => <button type="button" key={entry.key} className={at === index ? 'is-current' : at < index ? 'is-seen' : ''} onClick={() => setIndex(at)} aria-label={entry.title} aria-current={at === index}>{entry.title}</button>)}
      </nav>
      <div className="mono-guide-page" key={page.key}>
        <div className="mono-guide-art" aria-hidden="true">{page.art}</div>
        <div className="mono-guide-copy">
          <h2 id="guide-title">{page.title}</h2>
          {page.body}
        </div>
      </div>
      <footer className="mono-guide-foot">
        <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={15} /> ӨМНӨХ</button>
        <span className="mono-guide-dots" aria-hidden="true">{list.map((entry, at) => <i key={entry.key} className={at === index ? 'on' : ''} />)}</span>
        {last
          ? <button type="button" className="primary-button" onClick={onClose}>ОЙЛГОЛОО</button>
          : <button type="button" className="primary-button" onClick={() => setIndex(index + 1)}>ДАРААХ <ChevronRight size={15} /></button>}
      </footer>
    </section>
  </div>;
}
