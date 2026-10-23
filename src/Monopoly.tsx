import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft, Building2, ChevronRight, Clock3, Coins, Crown, Dices, Gavel, HandCoins, Landmark,
  Lock, PartyPopper, Plane, Plug, ScrollText, Sparkles, TrainFront, Trophy, LockOpen, Waves, X,
} from 'lucide-react';
import {
  BOARD, GROUP_TILES, HOUSE_RENT, JAIL_FINE, MAX_ROUNDS, currentPlayerId, netWorth, ownsGroup, rentFor,
  type ColorGroup, type MonopolyPlayer, type MonopolyState, type Tile,
} from './monopolyEngine';
import Avatar from './Avatar';
import { VoiceAvatarIndicator, VoiceChatProvider } from './VoiceChat';
import { playSfx, startMusic } from './sfx';
import { callGame, useCountdown, useGame, type NotifyFn, type RoomSeat } from './multiplayer';

const GROUP_LABEL: Record<ColorGroup, string> = {
  brown: 'Говь', sky: 'Хойд нутаг', pink: 'Баруун нутаг', orange: 'Хангай',
  red: 'Эртний нийслэл', yellow: 'Нуур, тал', green: 'Аж үйлдвэр', navy: 'Нийслэл',
};

/** Grid position of each of the 32 tiles on a 9×9 board, START in the bottom-right corner. */
function gridCell(index: number): CSSProperties {
  if (index <= 8) return { gridRow: 9, gridColumn: 9 - index };
  if (index <= 16) return { gridRow: 9 - (index - 8), gridColumn: 1 };
  if (index <= 24) return { gridRow: 1, gridColumn: 1 + (index - 16) };
  return { gridRow: 1 + (index - 24), gridColumn: 9 };
}

function side(index: number) {
  if (index % 8 === 0) return 'corner';
  if (index < 8) return 'bottom';
  if (index < 16) return 'left';
  if (index < 24) return 'top';
  return 'right';
}

function TileIcon({ tile, size = 14 }: { tile: Tile; size?: number }) {
  if (tile.kind === 'start') return <Sparkles size={size} />;
  if (tile.kind === 'jail') return <Lock size={size} />;
  if (tile.kind === 'parking') return <PartyPopper size={size} />;
  if (tile.kind === 'gotojail') return <Gavel size={size} />;
  if (tile.kind === 'chance') return <Sparkles size={size} />;
  if (tile.kind === 'chest') return <Coins size={size} />;
  if (tile.kind === 'tax') return <Landmark size={size} />;
  if (tile.kind === 'utility') return tile.id === 23 ? <Waves size={size} /> : <Plug size={size} />;
  if (tile.kind === 'rail') return tile.id === 13 ? <Plane size={size} /> : <TrainFront size={size} />;
  return null;
}

const money = (value: number) => `${value.toLocaleString('en-US')}₮`;

export default function MonopolyScreen({ roomCode, roomName, userId, isHost, seats, onLeave, onRematch, onNotice }: {
  roomCode: string; roomName: string; userId: string; isHost: boolean; seats: RoomSeat[];
  onLeave: () => void; onRematch: () => void; onNotice: NotifyFn;
}) {
  const { publicView, deadline, reload } = useGame(roomCode, userId);
  const game = publicView as unknown as MonopolyState | null;
  const secondsLeft = useCountdown(deadline);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const tickedFor = useRef<number | null>(null);
  const mySeat = seats.find((seat) => seat.user_id === userId)?.seat ?? null;

  // Any phone nudges the server when the turn timer runs out; the server re-checks the deadline.
  useEffect(() => {
    if (secondsLeft !== 0 || deadline === null || tickedFor.current === deadline) return;
    tickedFor.current = deadline;
    const timer = window.setTimeout(() => { void callGame('tick', { roomCode }).then(reload).catch(() => undefined); }, 300 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, deadline, roomCode, reload]);

  useEffect(() => {
    startMusic('monopoly');
    return () => startMusic('menu');
  }, []);

  // Sound cues: dice, buying, my turn, finish.
  const diceKey = game?.dice ? `${game.dice[0]}-${game.dice[1]}-${game.log.length}` : '';
  const ownedCount = game ? game.tiles.filter((entry) => entry.owner !== null).length : 0;
  const turnNow = game ? currentPlayerId(game) : null;
  const heard = useRef({ dice: diceKey, owned: ownedCount, turn: turnNow, finished: game?.phase === 'finished' });
  useEffect(() => {
    const last = heard.current;
    if (diceKey && diceKey !== last.dice) { playSfx('roll'); window.setTimeout(() => playSfx('step'), 900); }
    if (ownedCount > last.owned) playSfx('buy');
    if (turnNow !== last.turn && turnNow === mySeat && game?.phase !== 'finished') playSfx('turn');
    if (game?.phase === 'finished' && !last.finished) playSfx('win');
    heard.current = { dice: diceKey, owned: ownedCount, turn: turnNow, finished: game?.phase === 'finished' };
  }, [diceKey, ownedCount, turnNow, mySeat, game?.phase]);

  const ranking = useMemo(() => game ? [...game.players].sort((left, right) => netWorth(game, right.id) - netWorth(game, left.id)) : [], [game]);

  if (!game || game.kind !== 'monopoly') return <div className="mono-loading">Самбар бэлдэж байна…</div>;

  const turnId = currentPlayerId(game);
  const current = game.players.find((entry) => entry.id === turnId)!;
  const me = game.players.find((entry) => entry.id === mySeat) ?? null;
  const myTurn = me !== null && turnId === me.id && game.phase !== 'finished';
  const playerById = (id: number | null) => game.players.find((entry) => entry.id === id) ?? null;

  const send = async (move: string, tile?: number) => {
    setBusy(true);
    try {
      await callGame('board', { roomCode, move, ...(tile === undefined ? {} : { tile }) });
      await reload();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Алдаа гарлаа.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const landingTile = BOARD[current.position];
  const detail = selected === null ? null : BOARD[selected];

  return <VoiceChatProvider roomCode={roomCode} userId={userId} seats={seats} phase={game.phase === 'finished' ? 'results' : 'discussion'} alive isHost={isHost}>
    <div className="mono">
      <section className="mono-board" aria-label="Монгол Монополь самбар">
        {BOARD.map((tile) => {
          const tileState = game.tiles[tile.id];
          const owner = playerById(tileState.owner);
          const here = game.players.filter((entry) => !entry.bankrupt && entry.position === tile.id);
          return <button type="button" key={tile.id} style={gridCell(tile.id)}
            className={`mono-tile is-${side(tile.id)} kind-${tile.kind} ${tile.group ? `group-${tile.group}` : ''} ${owner ? `owned owner-${owner.color}` : ''} ${tileState.mortgaged ? 'is-mortgaged' : ''} ${selected === tile.id ? 'is-selected' : ''} ${current.position === tile.id ? 'is-active' : ''}`}
            onClick={() => setSelected(selected === tile.id ? null : tile.id)} aria-label={tile.name}>
            {tile.group && <span className="mono-tile-band" />}
            <span className="mono-tile-body">
              {(tile.kind !== 'property') && <span className="mono-tile-icon"><TileIcon tile={tile} size={tile.id % 8 === 0 ? 18 : 12} /></span>}
              <span className="mono-tile-name">{tile.short}</span>
              {tile.price !== undefined && <span className="mono-tile-price">{owner ? owner.name : money(tile.price)}</span>}
              {tile.kind === 'tax' && <span className="mono-tile-price">−{money(tile.rent!)}</span>}
            </span>
            {tileState.houses > 0 && <span className="mono-houses" aria-label={`${tileState.houses} барилга`}>{tileState.houses === 5 ? <Building2 size={10} /> : Array.from({ length: tileState.houses }, (_, index) => <i key={index} />)}</span>}
            {here.length > 0 && <span className="mono-tokens">{here.map((entry) => <span key={entry.id} className={`mono-token avatar-${entry.color} ${entry.id === turnId ? 'is-turn' : ''}`} title={entry.name}>{entry.initials.slice(0, 1)}</span>)}</span>}
          </button>;
        })}

        <div className="mono-center">
          {detail ? <TileDetail tile={detail} game={game} me={me} myTurn={myTurn} busy={busy} onClose={() => setSelected(null)} onAction={(move) => void send(move, detail.id)} /> : <>
            <div className="mono-brand"><b>МОНГОЛ</b><span>МОНОПОЛЬ</span></div>
            <div className="mono-dice-tray" aria-label={game.dice ? `${game.dice[0]} ба ${game.dice[1]}` : 'Шоо'}>
              <div className="mono-dice">
                {(game.dice ?? [0, 0]).map((value, index) => <Die key={`${game.log.length}-${index}-${value}`} value={value} index={index} />)}
              </div>
              {game.dice && <span className="mono-dice-total">{game.dice[0] + game.dice[1]}</span>}
            </div>
            {myTurn && game.phase === 'roll' && <button type="button" className="mono-roll-button" disabled={busy} onClick={() => void send('roll')}><Dices size={16} /> {me!.inJail ? 'ХОС ХАЯЖ ГАРАХ' : 'ШОО ХАЯХ'}</button>}
            {!myTurn && game.phase !== 'finished' && <p className="mono-center-turn"><b>{current.name}</b> {game.phase === 'roll' ? 'шоо хаяна' : 'ээлжээ үргэлжлүүлж байна'}</p>}
            {game.card && <div className="mono-card"><b>{game.card.title}</b><span>{game.card.text}</span></div>}
            <div className="mono-log">{game.log.slice(-3).map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div>
          </>}
        </div>
      </section>

      <aside className="mono-side">
        <header className="mono-side-head">
          <div><span>{roomName.toUpperCase()}</span><b>ТОЙРОГ {Math.min(game.round, MAX_ROUNDS)}/{MAX_ROUNDS}</b></div>
          <div className="mono-timer"><Clock3 size={13} />{game.phase === 'finished' ? '—' : secondsLeft ?? '—'}</div>
          <button type="button" className="icon-button" onClick={() => setLeaveOpen(true)} aria-label="Тоглоомоос гарах"><ArrowLeft size={15} /></button>
        </header>

        <div className="mono-players">
          {game.players.map((entry) => <PlayerRow key={entry.id} entry={entry} game={game} isTurn={entry.id === turnId && game.phase !== 'finished'} isMe={entry.id === mySeat} />)}
        </div>

        <div className="mono-actions">
          {game.phase === 'finished'
            ? <Finished game={game} ranking={ranking} isHost={isHost} onReplay={onRematch} onLeave={onLeave} />
            : !myTurn
              ? <div className="mono-waiting"><Avatar name={current.name} color={current.color} url={current.avatarUrl} initials={current.initials} /><span><b>{current.name}</b>{game.phase === 'roll' ? ' шоо хаяхыг хүлээж байна' : game.phase === 'buy' ? ` ${landingTile.name}-г авах эсэхээ шийдэж байна` : ' ээлжээ дуусгаж байна'}</span></div>
              : <MyTurn game={game} me={me!} busy={busy} onAction={(move) => void send(move)} />}
        </div>
      </aside>

      {leaveOpen && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true"><h2>Тоглоомоос гарах уу?</h2><p>Гарвал та дампуурсанд тооцогдож, бүх өмч банкинд буцна.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setLeaveOpen(false)}>ҮЛДЭХ</button><button className="primary-button" onClick={onLeave}>ГАРАХ</button></div></section></div>}
    </div>
  </VoiceChatProvider>;
}

function Die({ value, index }: { value: number; index: number }) {
  const pips: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  return <span className={`mono-die ${value ? 'is-rolled' : 'is-empty'} die-${index}`}>{Array.from({ length: 9 }, (_, cell) => <i key={cell} className={(pips[value] ?? []).includes(cell + 1) ? 'on' : ''} />)}</span>;
}

function PlayerRow({ entry, game, isTurn, isMe }: { entry: MonopolyPlayer; game: MonopolyState; isTurn: boolean; isMe: boolean }) {
  const owned = game.tiles.filter((tileState) => tileState.owner === entry.id).length;
  return <div className={`mono-player ${isTurn ? 'is-turn' : ''} ${entry.bankrupt ? 'is-bankrupt' : ''}`}>
    <Avatar name={entry.name} color={entry.color} url={entry.avatarUrl} initials={entry.initials}>{entry.host && <i><Crown size={9} /></i>}<VoiceAvatarIndicator name={entry.name} seat={entry.id} /></Avatar>
    <span className="mono-player-copy"><b>{entry.name}{isMe && <small>ЧИ</small>}</b><span>{entry.bankrupt ? 'ДАМПУУРСАН' : entry.inJail ? `ШОРОНД · ${owned} газар` : `${owned} газар`}</span></span>
    <span className="mono-player-money">{entry.bankrupt ? '—' : money(entry.money)}</span>
  </div>;
}

function MyTurn({ game, me, busy, onAction }: { game: MonopolyState; me: MonopolyPlayer; busy: boolean; onAction: (move: string) => void }) {
  const tile = BOARD[me.position];
  if (game.phase === 'roll') {
    return <div className="mono-turn">
      <p className="mono-turn-title">Таны ээлж{me.inJail ? ' · шоронд байна' : ''}</p>
      <button className="primary-button mono-big" disabled={busy} onClick={() => onAction('roll')}><Dices size={18} /> {me.inJail ? 'ХОС ХАЯЖ ГАРАХ' : 'ШОО ХАЯХ'}</button>
      {me.inJail && <button className="secondary-button" disabled={busy || me.money < JAIL_FINE} onClick={() => onAction('pay-jail')}><LockOpen size={14} /> {money(JAIL_FINE)} ТӨЛЖ ГАРАХ</button>}
      <p className="mono-hint">Газар дээр дарж байшин барих, барьцаалах боломжтой.</p>
    </div>;
  }
  if (game.phase === 'buy') {
    return <div className="mono-turn">
      <div className={`mono-offer ${tile.group ? `group-${tile.group}` : ''}`}><span className="mono-offer-band" /><b>{tile.name}</b><small>{tile.region}</small><strong>{money(tile.price!)}</strong></div>
      <button className="primary-button mono-big" disabled={busy || me.money < tile.price!} onClick={() => onAction('buy')}><HandCoins size={16} /> ХУДАЛДАЖ АВАХ</button>
      <button className="secondary-button" disabled={busy} onClick={() => onAction('decline')}>АЛГАСАХ</button>
      {me.money < tile.price! && <p className="mono-hint">Мөнгө хүрэлцэхгүй байна.</p>}
    </div>;
  }
  return <div className="mono-turn">
    <p className="mono-turn-title">{tile.name}</p>
    <button className="primary-button mono-big" disabled={busy} onClick={() => onAction('end')}>{game.rollAgain ? <><Dices size={16} /> ДАХИН ХАЯХ (ХОС)</> : <>ЭЭЛЖ ДУУСГАХ <ChevronRight size={16} /></>}</button>
    <p className="mono-hint">Өөрийн газар дээр дарж гэр барина. Нэг өнгийн бүх газрыг эзэмшвэл түрээс 2 дахин өснө.</p>
  </div>;
}

function TileDetail({ tile, game, me, myTurn, busy, onClose, onAction }: {
  tile: Tile; game: MonopolyState; me: MonopolyPlayer | null; myTurn: boolean; busy: boolean; onClose: () => void; onAction: (move: string) => void;
}) {
  const tileState = game.tiles[tile.id];
  const owner = game.players.find((entry) => entry.id === tileState.owner) ?? null;
  const mine = me !== null && owner?.id === me.id;
  const group = tile.group ? GROUP_TILES[tile.group] : [];
  const groupComplete = mine && tile.group ? ownsGroup(game, me!.id, tile.group) : false;
  const rows: Array<[string, ReactNode]> = [];
  if (tile.kind === 'property') {
    rows.push(['Түрээс', money(tile.rent!)], ['Бүлгээрээ', money(tile.rent! * 2)]);
    for (let houses = 1; houses <= 5; houses += 1) rows.push([houses === 5 ? 'Жуулчны бааз' : `${houses} гэр`, money(tile.rent! * HOUSE_RENT[houses])]);
    rows.push(['Гэр барих', money(tile.houseCost!)]);
  }
  if (tile.kind === 'rail') rows.push(['1 / 2 / 3 эзэмшвэл', '25₮ / 50₮ / 100₮']);
  if (tile.kind === 'utility') rows.push(['1 эзэмшвэл', 'шоо × 4'], ['2 эзэмшвэл', 'шоо × 10']);
  const describe: Partial<Record<Tile['kind'], string>> = {
    start: 'Эхлэлийг давах бүрт 200₮ авна.', jail: 'Зочлох эсвэл шоронд суух. Хос буулгах эсвэл 50₮ төлж гарна.',
    parking: 'Наадмын амралт. Юу ч болохгүй.', gotojail: 'Шууд шоронд очно.', chance: 'Хувь тавилангийн карт сугална.',
    chest: 'Эрдэнэсийн авдрын карт сугална.', tax: `${tile.rent}₮ татвар төлнө.`,
  };
  return <div className={`mono-detail ${tile.group ? `group-${tile.group}` : ''}`}>
    <button type="button" className="mono-detail-close" onClick={onClose} aria-label="Хаах"><X size={15} /></button>
    {tile.group && <span className="mono-detail-band"><small>{GROUP_LABEL[tile.group]}</small></span>}
    <h3><TileIcon tile={tile} size={15} /> {tile.name}</h3>
    {tile.region && <p className="mono-detail-region">{tile.region}{tile.price ? ` · ${money(tile.price)}` : ''}</p>}
    {describe[tile.kind] && <p className="mono-detail-text">{describe[tile.kind]}</p>}
    {rows.length > 0 && <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {owner && <p className="mono-detail-owner"><ScrollText size={12} /> Эзэн: <b>{owner.name}</b>{tileState.mortgaged ? ' · барьцаанд' : ''}{tileState.houses ? ` · ${tileState.houses === 5 ? 'бааз' : `${tileState.houses} гэр`}` : ''}{owner.id !== me?.id && !tileState.mortgaged ? ` · одоогийн түрээс ${money(rentFor(game, tile.id, 7))}` : ''}</p>}
    {mine && myTurn && <div className="mono-detail-actions">
      {tile.kind === 'property' && groupComplete && !tileState.mortgaged && tileState.houses < 5 && <button className="primary-button" disabled={busy} onClick={() => onAction('build')}><Building2 size={13} /> ГЭР БАРИХ {money(tile.houseCost!)}</button>}
      {tileState.houses > 0 && <button className="secondary-button" disabled={busy} onClick={() => onAction('sell')}>ГЭР ЗАРАХ +{money(tile.houseCost! / 2)}</button>}
      {!tileState.mortgaged && tileState.houses === 0 && !group.some((other) => game.tiles[other].houses > 0) && <button className="secondary-button" disabled={busy} onClick={() => onAction('mortgage')}>БАРЬЦААЛАХ +{money(tile.price! / 2)}</button>}
      {tileState.mortgaged && <button className="secondary-button" disabled={busy} onClick={() => onAction('unmortgage')}>БАРЬЦААНААС ГАРГАХ −{money(Math.ceil(tile.price! * 0.55))}</button>}
    </div>}
    {mine && !myTurn && <p className="mono-hint">Барилга, барьцааг зөвхөн өөрийн ээлжээр хийнэ.</p>}
  </div>;
}

function Finished({ game, ranking, isHost, onReplay, onLeave }: { game: MonopolyState; ranking: MonopolyPlayer[]; isHost: boolean; onReplay: () => void; onLeave: () => void }) {
  const winner = game.players.find((entry) => entry.id === game.winner);
  return <div className="mono-finished">
    <p className="mono-turn-title"><Trophy size={15} /> {winner ? `${winner.name} яллаа!` : 'Тоглоом дууслаа'}</p>
    <ol>{ranking.map((entry) => <li key={entry.id}><span>{entry.name}</span><b>{entry.bankrupt ? 'дампуурсан' : money(netWorth(game, entry.id))}</b></li>)}</ol>
    <div className="mono-finished-actions">
      <button className="secondary-button" onClick={onLeave}><ArrowLeft size={14} /> ГАРАХ</button>
      {isHost ? <button className="primary-button" onClick={onReplay}>ДАХИН ТОГЛОХ <ChevronRight size={14} /></button> : <span className="mono-hint">Эзэн шинэ тоглолт эхлүүлэхийг хүлээж байна</span>}
    </div>
  </div>;
}
