import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight, Building2, ChevronLeft, ChevronRight, Coins, Dices, Gavel, HandCoins, Landmark, Lock, PartyPopper, Plane,
  Plug, Sparkles, Trophy, Waves, X,
} from 'lucide-react';
import {
  JAIL_FINE, MAX_OFFERS_PER_TURN, PASS_START_BONUS, sanitizeMonopolySettings, type MonopolySettings,
} from './monopolyEngine';

import { t } from './lang';
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
      key: 'goal', title: t('Зорилго', 'Goal'),
      art: <div className="guide-art-stack"><Trophy size={44} /><span className="guide-coin-row"><Coins size={16} /><Coins size={16} /><Coins size={16} /></span></div>,
      body: <>
        <p>{t(`Монгол нутгийн газрууд худалдаж аваад, бусад тоглогчоос `, `Buy places across Mongolia and collect `)}<b>{t(`түрээс`, `rent`)}</b>{t(` ав. Мөнгөгүй болсон тоглогч `, ` from the other players. A player who runs out of money `)}<b>{t(`дампуурч`, `goes bankrupt`)}</b>{t(` тоглоомоос гарна.`, ` and leaves the game.`)}</p>
        <p><b>{t(`Хамгийн сүүлд үлдсэн тоглогч ялна.`, `The last player standing wins.`)}</b> {rules?.rounds ? t(`Энэ өрөөнд ${rules.rounds} тойргийн дараа хамгийн их хөрөнгөтэй нь ялна.`, `In this room, the richest player after ${rules.rounds} rounds wins.`) : t('Тойргийн хязгаартай өрөөнд хязгаар дуусахад хамгийн их хөрөнгөтэй нь ялна.', 'In rooms with a round limit, the richest player wins when the limit is reached.')}</p>
        <p className="guide-note">{t(`Тоглогч бүр ${money(rules?.startingCash ?? 1500)}-тэй эхэлнэ.`, `Every player starts with ${money(rules?.startingCash ?? 1500)}.`)}</p>
      </>,
    },
    {
      key: 'turn', title: t('Ээлж', 'Your turn'),
      art: <div className="guide-art-stack"><span className="guide-dice"><Pip value={4} /><Pip value={4} /></span><span className="guide-tag">{t(`ХОС = ДАХИН`, `DOUBLES = AGAIN`)}</span></div>,
      body: <>
        <p>{t(`Ээлжээрээ `, `On your turn, tap `)}<b>{t(`ШОО ХАЯХ`, `ROLL DICE`)}</b>{t(` товчийг дарна. Хоёр шооны нийлбэрээр таны дүрс цагийн зүүний дагуу алхана.`, `. Your token moves clockwise by the total of the two dice.`)}</p>
        <p><b>{t(`Хос`, `Doubles`)}</b>{t(` (хоёр ижил тоо) буувал дахин хаяна. Гурван удаа дараалан хос буувал шууд шоронд орно.`, ` (two equal numbers) mean you roll again. Three doubles in a row send you straight to jail.`)}</p>
        <p><b>{t(`Эхлэл`, `Start`)}</b>{t(`-ийг давах бүрт банкнаас ${money(PASS_START_BONUS)} авна.`, `: collect ${money(PASS_START_BONUS)} from the bank each time you pass it.`)}</p>
      </>,
    },
    {
      key: 'buy', title: t('Газар худалдаж авах', 'Buying property'),
      art: <div className="guide-art-stack"><Deed group="orange" name={t('Цэцэрлэг', 'Tsetserleg')} price={200} /><HandCoins size={26} /></div>,
      body: <>
        <p>{t(`Эзэнгүй газар, нисэх буудал, өртөө эсвэл станц дээр буувал үнээр нь `, `Land on an unowned place, airport, station or plant and you may `)}<b>{t(`худалдаж авч`, `buy it`)}</b>{t(` болно.`, ` for its price.`)}</p>
        {auction
          ? <p>{t(`Авахгүй бол газар `, `If you don’t, the property goes to `)}<b>{t(`дуудлага худалдаанд`, `auction`)}</b>{t(` гарна. Ээлжээрээ үнэ нэмж хаяна, өнжсөн хүн дахин оролцохгүй. Хамгийн өндөр үнэ хаясан нь авна.`, `. Players raise the bid in turn; whoever passes is out. The highest bid wins.`)}</p>
          : <p>{t(`Авахгүй бол газар эзэнгүй хэвээр үлдэж, дараа нь буусан хүн авч болно.`, `If you don’t, it stays unowned and the next player to land there may buy it.`)}</p>}
      </>,
    },
    {
      key: 'rent', title: t('Түрээс', 'Rent'),
      art: <div className="guide-art-stack guide-set"><Deed group="red" name={t('Өндөрхаан', 'Undurkhaan')} price={220} rent="18₮" /><Deed group="red" name={t('Дадал', 'Dadal')} price={220} rent="18₮" /><Deed group="red" name={t('Хархорин', 'Kharkhorin')} price={240} rent="20₮" /></div>,
      body: <>
        <p>{t(`Бусдын газар дээр буувал эзэнд нь `, `Land on someone else’s property and you pay them `)}<b>{t(`түрээс`, `rent`)}</b>{t(` төлнө. Барьцаалсан газарт түрээс төлөхгүй.`, `. Mortgaged property earns no rent.`)}</p>
        {doubleRent && <p>{t(`Нэг `, `Own `)}<b>{t(`өнгийн бүх газрыг`, `every property of one colour`)}</b>{t(` эзэмшвэл гэргүй ч түрээс нь `, ` and its rent `)}<b>{t(`2 дахин`, `doubles`)}</b>{t(` өснө.`, ` even without gers.`)}</p>}
        <p><Plane size={12} />{t(` Нисэх буудал, өртөө, боомт: эзэмшсэн тоогоороо 25₮ → 50₮ → 100₮ → 200₮.`, ` Airports, stations and ports: 25₮ → 50₮ → 100₮ → 200₮ by how many you own.`)}<br /><Plug size={12} /> <Waves size={12} />{t(` Станц, ус суваг: шооны нийлбэр ×4, хоёуланг нь эзэмшвэл ×10.`, ` Power plant and water works: dice total ×4, or ×10 if you own both.`)}</p>
      </>,
    },
    {
      key: 'build', title: t('Гэр, жуулчны бааз', 'Gers and ger camps'),
      art: <div className="guide-art-stack"><span className="guide-houses"><i /><i /><i /><i /></span><ChevronRight size={18} /><span className="guide-hotel"><Building2 size={22} /></span></div>,
      body: <>
        <p>{t(`Нэг өнгийн бүх газраа бүрдүүлсний дараа өөрийн ээлжээр газар дээрээ дарж `, `Once you own a full colour group, tap a property on your turn to `)}<b>{t(`гэр барина`, `build a ger`)}</b>{t(`. Гэр бүр түрээсийг огцом өсгөнө.`, `. Each ger raises the rent sharply.`)}</p>
        {evenBuild && <p>{t(`Гэрийг `, `Build `)}<b>{t(`тэгш`, `evenly`)}</b>{t(` барина: бүлгийн газар бүрт нэг нэгээр нэмнэ.`, `: add one ger at a time to each property in the group.`)}</p>}
        <p>{t(`4 гэрийн дараа `, `After 4 gers, build a `)}<b>{t(`жуулчны бааз`, `ger camp`)}</b>{t(` барина — хамгийн өндөр түрээс. Гэрээ хагас үнээр нь банкинд буцааж зарж болно.`, ` — the highest rent. You can sell gers back to the bank for half price.`)}</p>
      </>,
    },
    {
      key: 'tiles', title: t('Тусгай нүднүүд', 'Special squares'),
      art: <div className="guide-art-stack"><span className="guide-icon-grid"><Sparkles size={18} /><Coins size={18} /><Landmark size={18} /><PartyPopper size={18} /><Lock size={18} /><Gavel size={18} /></span></div>,
      body: <ul className="guide-list">
        <li><Sparkles size={12} /><b>{t(`Хувь тавилан`, `Fortune`)}</b>, <Coins size={12} /><b>{t(`Эрдэнэсийн авдар`, `Treasure Chest`)}</b>{t(` — карт сугалж, бичсэнийг нь хийнэ.`, ` — draw a card and do what it says.`)}</li>
        <li><Landmark size={12} /><b>{t(`Орлогын татвар`, `Income Tax`)}</b>{t(` — бэлэн мөнгөнийхөө 10%. `, ` — 10% of your cash. `)}<b>{t(`Тансгийн татвар`, `Luxury Tax`)}</b> — 75₮.</li>
        <li><PartyPopper size={12} /><b>{t(`Наадмын амралт`, `Naadam Holiday`)}</b> — {vacation ? t('татвар, торгууль энд хуримтлагдана; энд буусан хүн бүгдийг нь авна.', 'taxes and fines collect here; whoever lands here takes it all.') : t('амралт, юу ч болохгүй.', 'a holiday, nothing happens.')}</li>
        <li><Gavel size={12} /><b>{t(`Шоронд яв`, `Go to Jail`)}</b>{t(` — шууд шоронд очно, Эхлэлийг давсанд тооцохгүй.`, ` — go straight to jail; it doesn’t count as passing Start.`)}</li>
      </ul>,
    },
    {
      key: 'jail', title: t('Шорон', 'Jail'),
      art: <div className="guide-art-stack"><span className="guide-bars"><Lock size={30} /></span><span className="guide-tag">{money(JAIL_FINE)}</span></div>,
      body: <>
        <p>{t(`Шоронд орсон бол гарах гурван арга бий: `, `There are three ways out of jail: `)}<b>{t(`хос буулгах`, `roll doubles`)}</b>{t(` (гурван оролдлого), `, ` (three tries), `)}<b>{t(`${money(JAIL_FINE)} торгууль`, `pay the ${money(JAIL_FINE)} fine`)}</b>{t(` төлөх эсвэл `, ` or use a `)}<b>{t(`«Өршөөл»`, `“Pardon”`)}</b>{t(` картаа ашиглах.`, ` card.`)}</p>
        <p>{t(`Гурав дахь оролдлогоор хос буухгүй бол торгуулиа төлж гарна.`, `If the third try isn’t doubles, you pay the fine and leave.`)}{rules?.prisonNoRent ? t(' Энэ өрөөнд шоронд байх хугацаандаа түрээс авахгүй.', ' In this room you collect no rent while in jail.') : t(' Шоронд байхдаа ч газрынхаа түрээсийг авна.', ' You still collect rent while in jail.')}</p>
        <p className="guide-note">{t(`«Шорон» нүдэн дээр зүгээр буувал зочилж байгаа гэсэн үг, юу ч болохгүй.`, `Landing on the “Jail” square just means visiting; nothing happens.`)}</p>
      </>,
    },
    {
      key: 'cash', title: t('Мөнгө дутвал', 'Short of money'),
      art: <div className="guide-art-stack"><Deed group="green" name={t('Эрдэнэт', 'Erdenet')} price={300} rent={mortgage ? t('барьцаа +150₮', 'mortgage +150₮') : undefined} /></div>,
      body: <>
        <p>{t(`Төлөх мөнгө хүрэлцэхгүй бол гэрээ зарж`, `If you can’t pay, sell gers`)}{mortgage ? <>{t(`, газраа `, `, `)}<b>{t(`барьцаалж`, `mortgage`)}</b>{t(` (үнийн тал) мөнгө олно. Барьцаагаа 10% хүүтэй буцааж гаргана`, ` property (for half its price). Lift a mortgage by paying it back with 10% interest`)}</> : t(' мөнгө олно', ' to raise money')}{t(`. Бусадтай арилжаа хийж ч болно.`, `. You can also trade with others.`)}</p>
        <p>{t(`Тэгээд ч төлж чадахгүй бол `, `If you still can’t pay, you `)}<b>{t(`дампуурна`, `go bankrupt`)}</b>{t(`: өмч тань өртэй тоглогчид (эсвэл банкинд) очиж, та тоглоомоос гарна.`, `: your property goes to the player you owe (or the bank), and you leave the game.`)}</p>
      </>,
    },
    {
      key: 'trade', title: t('Арилжаа', 'Trading'),
      art: <div className="guide-art-stack guide-trade"><Deed group="sky" name={t('Мөрөн', 'Murun')} price={100} /><ArrowLeftRight size={22} /><Deed group="sky" name={t('Улиастай', 'Uliastai')} price={120} /></div>,
      body: <>
        <p><b>{t(`АРИЛЖАА`, `TRADE`)}</b>{t(` товчоор өөр тоглогчид газар, мөнгө, шоронгийн карт солилцох санал илгээнэ. Нөгөө тал нь зөвшөөрөх эсвэл татгалзана.`, ` sends another player an offer of properties, money or jail cards. They accept or decline.`)}</p>
        <p>{t(`Нэг ээлжид ${MAX_OFFERS_PER_TURN} хүртэл санал тавина. Барилгатай бүлгийн газрыг арилжаалахгүй. Бүлгээ бүрдүүлэх хамгийн хурдан арга!`, `You can make up to ${MAX_OFFERS_PER_TURN} offers per turn. Properties in a built-up group can’t be traded. The fastest way to complete a group!`)}</p>
      </>,
    },
    {
      key: 'tips', title: t('Зөвлөмж', 'Tips'),
      art: <div className="guide-art-stack guide-set"><Deed group="orange" name={t('Баянхонгор', 'Bayankhongor')} price={180} /><Deed group="red" name={t('Өндөрхаан', 'Undurkhaan')} price={220} /></div>,
      body: <ul className="guide-list">
        <li><b>{t(`Улбар шар, улаан`, `Orange and red`)}</b>{t(` газрууд шоронгийн дараа хамгийн олон буудаг — авах нь ашигтай.`, ` properties are landed on most after jail — they’re worth buying.`)}</li>
        <li>{t(`Эхлээд хямд бүлгээ бүрдүүлж, `, `Complete a cheap group first and build up to `)}<b>{t(`3 гэр`, `3 gers`)}</b>{t(` хүртэл барь: түрээс хамгийн их өсдөг.`, `: that’s where rent jumps most.`)}</li>
        <li>{t(`Бэлэн мөнгө бага зэрэг үлдээ — гэнэтийн түрээс, татвар байнга гарна.`, `Keep some cash — surprise rent and taxes come often.`)}</li>
        <li>{t(`Бусдын бүлгийг бүрдүүлэхэд дутуу газрыг амархан бүү өг.`, `Don’t hand over the property that completes someone else’s group.`)}</li>
      </ul>,
    },
  ];
  if (rules) {
    const flags: Array<[string, boolean]> = [
      [t('Бүлгээрээ 2 дахин түрээс', 'Double rent for groups'), rules.doubleRent], [t('Наадмын сан', 'Naadam pot'), rules.vacationCash], [t('Дуудлага худалдаа', 'Auction'), rules.auction],
      [t('Шоронд түрээс авахгүй', 'No rent in jail'), rules.prisonNoRent], [t('Барьцаа', 'Mortgage'), rules.mortgage], [t('Тэгш барих', 'Even building'), rules.evenBuild],
    ];
    list.push({
      key: 'room', title: t('Энэ өрөөний дүрэм', 'This room’s rules'),
      art: <div className="guide-art-stack"><span className="guide-tag is-big">{money(rules.startingCash)}</span><span className="guide-tag">{rules.rounds ? t(`${rules.rounds} ТОЙРОГ`, `${rules.rounds} ROUNDS`) : t('ДАМПУУРТАЛ', 'TO BANKRUPTCY')}</span></div>,
      body: <ul className="guide-flags">{flags.map(([label, on]) => <li key={label} className={on ? 'is-on' : ''}><span>{on ? t('ТИЙМ', 'YES') : t('ҮГҮЙ', 'NO')}</span>{label}</li>)}</ul>,
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
        <span className="mono-guide-kicker"><Dices size={13} />{t(` ХЭРХЭН ТОГЛОХ · `, ` HOW TO PLAY · `)}{index + 1}/{list.length}</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('Хаах', 'Close')}><X size={15} /></button>
      </header>
      <nav className="mono-guide-tabs" ref={tabs} aria-label={t('Зааврын хуудсууд', 'Guide pages')}>
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
        <button type="button" className="secondary-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={15} />{t(` ӨМНӨХ`, ` BACK`)}</button>
        <span className="mono-guide-dots" aria-hidden="true">{list.map((entry, at) => <i key={entry.key} className={at === index ? 'on' : ''} />)}</span>
        {last
          ? <button type="button" className="primary-button" onClick={onClose}>{t(`ОЙЛГОЛОО`, `GOT IT`)}</button>
          : <button type="button" className="primary-button" onClick={() => setIndex(index + 1)}>{t(`ДАРААХ `, `NEXT`)}<ChevronRight size={15} /></button>}
      </footer>
    </section>
  </div>;
}
