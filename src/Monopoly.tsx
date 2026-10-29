import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowLeftRight, BookOpen, Building2, ChevronRight, Clock3, Coins, Crown, Dices, Gavel, HandCoins, Handshake, KeyRound, Landmark,
  Lock, Minus, PartyPopper, Plane, Plug, Plus, ScrollText, Sparkles, TrainFront, Trophy, LockOpen, Waves, X,
} from 'lucide-react';
import {
  BOARD, GROUP_TILES, JAIL_FINE, MAX_OFFERS_PER_TURN, PASS_START_BONUS, actingPlayerId, bankSupply, canTradeTile, currentPlayerId, describeSide,
  minimumBid, mortgageInterest, mortgageValue, netWorth, ownsGroup, rentFor, roundLimit, rulesOf, unmortgageCost,
  type AuctionState, type ColorGroup, type MonopolyPlayer, type MonopolyState, type Tile, type TradeOffer, type TradeProposal,
} from './monopolyEngine';
import Avatar, { RowBorder, nameplate, rowBorderClass } from './Avatar';
import { VoiceAvatarIndicator, VoiceChatProvider } from './VoiceChat';
import { playSfx, startMusic } from './sfx';
import { callGame, useCountdown, useGame, type NotifyFn, type RoomSeat } from './multiplayer';
import { RankResultBanner } from './Ranks';
import { MonopolyGuide } from './MonopolyGuide';

const GROUP_LABEL: Record<ColorGroup, string> = {
  brown: 'Говь', sky: 'Хойд нутаг', pink: 'Баруун нутаг', orange: 'Хангай',
  red: 'Эртний нийслэл', yellow: 'Нуур, тал', green: 'Аж үйлдвэр', navy: 'Нийслэл',
};

/** Grid position of each of the 40 tiles on an 11×11 board: START top-left, play runs clockwise. */
function gridCell(index: number): CSSProperties {
  if (index <= 10) return { gridRow: 1, gridColumn: 1 + index };
  if (index <= 20) return { gridRow: 1 + (index - 10), gridColumn: 11 };
  if (index <= 30) return { gridRow: 11, gridColumn: 11 - (index - 20) };
  return { gridRow: 11 - (index - 30), gridColumn: 1 };
}

function side(index: number) {
  if (index % 10 === 0) return 'corner';
  if (index < 10) return 'top';
  if (index < 20) return 'right';
  if (index < 30) return 'bottom';
  return 'left';
}

function TileIcon({ tile, size = 14 }: { tile: Tile; size?: number }) {
  if (tile.kind === 'start') return <Sparkles size={size} />;
  if (tile.kind === 'jail') return <Lock size={size} />;
  if (tile.kind === 'parking') return <PartyPopper size={size} />;
  if (tile.kind === 'gotojail') return <Gavel size={size} />;
  if (tile.kind === 'chance') return <Sparkles size={size} />;
  if (tile.kind === 'chest') return <Coins size={size} />;
  if (tile.kind === 'tax') return <Landmark size={size} />;
  if (tile.kind === 'utility') return tile.id === 28 ? <Waves size={size} /> : <Plug size={size} />;
  if (tile.kind === 'rail') return tile.id === 5 ? <Plane size={size} /> : <TrainFront size={size} />;
  return null;
}

const money = (value: number) => `${value.toLocaleString('en-US')}₮`;

/** One clearly different colour per player for their deeds, piece and row: your own is always pink, the others follow seat order. */
const OWNER_COLORS = ['#ff5ca8', '#ff5252', '#ffd23f', '#3ddc84', '#3fa7ff', '#b07cff'];
function ownerColor(game: MonopolyState, id: number | null | undefined, mySeat: number | null | undefined) {
  const order = [...game.players.filter((entry) => entry.id === mySeat), ...game.players.filter((entry) => entry.id !== mySeat)];
  const index = order.findIndex((entry) => entry.id === id);
  return index < 0 ? undefined : OWNER_COLORS[index % OWNER_COLORS.length];
}
const ownerStyle = (color: string | undefined) => (color ? { '--owner': color } : {}) as CSSProperties;

/** Trade offers this player may still make during the current turn. */
const offersLeft = (game: MonopolyState, id: number) => MAX_OFFERS_PER_TURN - (game.offerCounts?.[id] ?? 0);

/** Digits only, so a typed amount never starts with a stuck "0". */
const digits = (value: string) => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7);

export default function MonopolyScreen({ roomCode, roomName, userId, isHost, seats, onLeave, onRematch, onNotice, onProfile, watching = false }: {
  roomCode: string; roomName: string; userId: string; isHost: boolean; seats: RoomSeat[];
  onLeave: () => void; onRematch: () => void; onNotice: NotifyFn; onProfile: (seat: number) => void;
  /** An admin watching the table: read only, no voice. */
  watching?: boolean;
}) {
  const { publicView, deadline, reload } = useGame(roomCode, userId);
  const game = publicView as unknown as MonopolyState | null;
  const secondsLeft = useCountdown(deadline);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [trading, setTrading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const tickedFor = useRef<number | null>(null);
  const mySeat = seats.find((seat) => seat.user_id === userId)?.seat ?? null;
  // Anyone still in the game may offer a trade (also off turn) while no other offer, purchase or auction is open.
  const meNow = game && game.kind === 'monopoly' ? game.players.find((entry) => entry.id === mySeat) : undefined;
  const canPropose = Boolean(game && game.kind === 'monopoly' && meNow && !meNow.bankrupt && !game.trade
    && (game.phase === 'roll' || game.phase === 'end'));
  useEffect(() => { if (!canPropose) setTrading(false); }, [canPropose]);

  // Any phone nudges the server when the turn timer runs out; the server re-checks the deadline.
  useEffect(() => {
    if (watching || secondsLeft !== 0 || deadline === null || tickedFor.current === deadline) return;
    tickedFor.current = deadline;
    const timer = window.setTimeout(() => { void callGame('tick', { roomCode }).then(reload).catch(() => undefined); }, 300 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [watching, secondsLeft, deadline, roomCode, reload]);

  useEffect(() => {
    startMusic('monopoly');
    return () => startMusic('menu');
  }, []);

  // Sound cues: dice, buying, my turn (or my bid, or an offer for me), finish.
  const diceKey = game?.dice ? `${game.dice[0]}-${game.dice[1]}-${game.log.length}` : '';
  const ownedCount = game ? game.tiles.filter((entry) => entry.owner !== null).length : 0;
  const turnNow = game && game.kind === 'monopoly' ? actingPlayerId(game) : null;
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
  const trade = game.phase !== 'finished' ? game.trade ?? null : null;
  const auction = game.phase === 'auction' ? game.auction ?? null : null;
  /** My own turn with nothing else (an auction, a trade offer) holding it up. */
  const myMove = myTurn && !trade && !auction;
  const limit = roundLimit(game);
  const rules = rulesOf(game);
  const pot = game.pot ?? 0;
  const actor = playerById(actingPlayerId(game)) ?? current;

  const send = async (move: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await callGame('board', { roomCode, move, ...extra });
      await reload();
      return true;
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Алдаа гарлаа.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const landingTile = BOARD[current.position];
  const detail = selected === null ? null : BOARD[selected];
  const tradedTiles = trade ? [...trade.give, ...trade.get] : [];
  const centerStatus = trade
    ? <><b>{playerById(trade.from)?.name}</b> ⇄ <b>{playerById(trade.to)?.name}</b> арилжаа хэлэлцэж байна</>
    : auction ? <><b>{actor.name}</b> үнэ хаяж байна</>
      : <><b>{current.name}</b> {game.phase === 'roll' ? 'шоо хаяна' : 'ээлжээ үргэлжлүүлж байна'}</>;

  const board = <div className="mono">
      <section className="mono-board" aria-label="Монгол Монополь самбар">
        {BOARD.map((tile) => {
          const tileState = game.tiles[tile.id];
          const owner = playerById(tileState.owner);
          // Whoever's turn it is sits on top of the stack.
          const here = game.players.filter((entry) => !entry.bankrupt && entry.position === tile.id).sort((left, right) => Number(left.id === turnId) - Number(right.id === turnId));
          return <button type="button" key={tile.id} style={{ ...gridCell(tile.id), ...ownerStyle(owner ? ownerColor(game, owner.id, mySeat) : undefined) }}
            className={`mono-tile is-${side(tile.id)} kind-${tile.kind} ${tile.group ? `group-${tile.group}` : ''} ${owner ? `owned owner-${owner.color}` : ''} ${tileState.mortgaged ? 'is-mortgaged' : ''} ${selected === tile.id ? 'is-selected' : ''} ${current.position === tile.id ? 'is-active' : ''} ${auction?.tile === tile.id ? 'is-auction' : ''} ${tradedTiles.includes(tile.id) ? 'is-traded' : ''} ${here.length ? 'has-tokens' : ''}`}
            onClick={() => setSelected(selected === tile.id ? null : tile.id)} aria-label={tile.name}>
            {tile.group && <span className="mono-tile-band" />}
            <span className="mono-tile-body">
              {(tile.kind !== 'property') && <span className="mono-tile-icon"><TileIcon tile={tile} size={tile.id % 10 === 0 ? 18 : 12} /></span>}
              <span className="mono-tile-name">{tile.short}</span>
              {tile.price !== undefined && <span className="mono-tile-price">{money(tile.price)}</span>}
              {tile.kind === 'tax' && <span className="mono-tile-price">{tile.taxPercent ? `${tile.taxPercent}%` : money(tile.rent!)}</span>}
              {tile.kind === 'start' && <span className="mono-tile-price">+{money(PASS_START_BONUS)}</span>}
              {tile.kind === 'parking' && rules.vacationCash && <span className="mono-tile-price mono-pot-amount">{money(pot)}</span>}
            </span>
            {tileState.houses > 0 && <span className="mono-houses" aria-label={`${tileState.houses} барилга`}>{tileState.houses === 5 ? <Building2 size={10} /> : Array.from({ length: tileState.houses }, (_, index) => <i key={index} />)}</span>}
            {here.length > 0 && <span className={`mono-tokens count-${Math.min(here.length, 4)}`}>{here.map((entry) => <Token key={entry.id} player={entry} color={ownerColor(game, entry.id, mySeat)} isTurn={entry.id === turnId && game.phase !== 'finished'} isMe={entry.id === mySeat} />)}</span>}
          </button>;
        })}

        <div className="mono-center">
          {detail ? <TileDetail tile={detail} game={game} me={me} myTurn={myMove} busy={busy} onClose={() => setSelected(null)} onAction={(move) => void send(move, { tile: detail.id })} /> : <>
            <div className="mono-brand is-watermark" aria-hidden="true"><b>МОНГОЛ</b><span>МОНОПОЛЬ</span></div>
            <div className="mono-center-top">
              <div className="mono-dice-tray" aria-label={game.dice ? `${game.dice[0]} ба ${game.dice[1]}` : 'Шоо'}>
                <div className="mono-dice">
                  {(game.dice ?? [0, 0]).map((value, index) => <Die key={`${game.log.length}-${index}-${value}`} value={value} index={index} />)}
                </div>
                {game.dice && <span className="mono-dice-total">{game.dice[0] + game.dice[1]}</span>}
              </div>
              {rules.vacationCash && <span className="mono-pot-badge" title="Татвар, торгууль энд хуримтлагдаж, Наадам дээр буусан хүн авна"><PartyPopper size={13} /> Наадмын сан <b>{money(pot)}</b></span>}
              {myMove && game.phase === 'roll' && <button type="button" className="mono-roll-button" disabled={busy} onClick={() => void send('roll')}><Dices size={16} /> {me!.inJail ? 'ХОС ХАЯЖ ГАРАХ' : 'ШОО ХАЯХ'}</button>}
              {!myMove && game.phase !== 'finished' && <p className="mono-center-turn">{centerStatus}</p>}
            </div>
            {auction
              ? <div className="mono-card is-auction"><b><Gavel size={12} /> Дуудлага худалдаа</b><span>{BOARD[auction.tile].name} · {auction.highBid ? `${money(auction.highBid)} — ${playerById(auction.highBidder)?.name ?? ''}` : 'санал алга'}</span></div>
              : game.card && <div className={`mono-card deck-${game.card.deck ?? 'chance'}`}><b>{game.card.title}</b><span>{game.card.text}</span></div>}
            <MonoFeed game={game} mySeat={mySeat} />
          </>}
        </div>
      </section>

      <aside className="mono-side">
        <header className="mono-side-head">
          <div><span>{roomName.toUpperCase()}</span><b>{limit === null ? <>ТОЙРОГ {game.round}</> : <>ТОЙРОГ {Math.min(game.round, limit)}/{limit}</>}</b></div>
          <div className="mono-timer"><Clock3 size={13} />{game.phase === 'finished' ? '—' : secondsLeft ?? '—'}</div>
          <button type="button" className="icon-button mono-guide-button" onClick={() => setGuideOpen(true)} aria-label="Тоглох заавар" title="Тоглох заавар"><BookOpen size={15} /></button>
          <button type="button" className="icon-button" onClick={() => watching ? onLeave() : setLeaveOpen(true)} aria-label="Тоглоомоос гарах"><ArrowLeft size={15} /></button>
        </header>

        <div className="mono-players">
          {game.players.map((entry) => <PlayerRow key={entry.id} entry={entry} game={game} color={ownerColor(game, entry.id, mySeat)} isTurn={entry.id === turnId && game.phase !== 'finished'} isMe={entry.id === mySeat}
            frame={seats.find((seat) => seat.seat === entry.id)?.frame_key} plateKey={seats.find((seat) => seat.seat === entry.id)?.nameplate_key} borderKey={seats.find((seat) => seat.seat === entry.id)?.border_key} onProfile={() => onProfile(entry.id)} />)}
        </div>

        <div className="mono-actions">
          {game.phase === 'finished'
            ? <>{!watching && <RankResultBanner roomCode={roomCode} userId={userId} />}<Finished game={game} ranking={ranking} isHost={isHost} onReplay={onRematch} onLeave={onLeave} /></>
            : trade
              ? <TradePanel game={game} trade={trade} me={me} busy={busy} onAction={(move) => void send(move)} />
              : auction
                ? <AuctionPanel game={game} auction={auction} me={me} busy={busy} onBid={(amount) => void send('bid', { amount })} onPass={() => void send('pass')} />
                : !myTurn
                  ? <div className="mono-waiting-wrap">
                    <div className="mono-waiting"><Avatar name={current.name} color={current.color} url={current.avatarUrl} initials={current.initials} /><span><b>{current.name}</b>{game.phase === 'roll' ? ' шоо хаяхыг хүлээж байна' : game.phase === 'buy' ? ` ${landingTile.name}-г авах эсэхээ шийдэж байна` : ' ээлжээ дуусгаж байна'}</span></div>
                    {me && !me.bankrupt && <button type="button" className="secondary-button mono-offturn-trade" disabled={busy || !canPropose || offersLeft(game, me.id) <= 0} onClick={() => setTrading(true)}
                      title={offersLeft(game, me.id) <= 0 ? 'Энэ ээлжийн саналууд дууссан' : undefined}><ArrowLeftRight size={14} /> АРИЛЖААНЫ САНАЛ</button>}
                  </div>
                  : <MyTurn game={game} me={me!} busy={busy} onAction={(move) => void send(move)} onTrade={() => setTrading(true)} />}
        </div>
      </aside>

      {guideOpen && <MonopolyGuide settings={{ ...rules, rounds: limit }} onClose={() => setGuideOpen(false)} />}

      {trading && me && <TradeComposer game={game} me={me} busy={busy} onClose={() => setTrading(false)}
        onSend={(offer) => void send('propose', { offer }).then((sent) => { if (sent) setTrading(false); })} />}

      {leaveOpen && <div className="game-modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true"><h2>Тоглоомоос гарах уу?</h2><p>Гарвал та дампуурсанд тооцогдож, бүх өмч банкинд буцна.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setLeaveOpen(false)}>ҮЛДЭХ</button><button className="primary-button" onClick={onLeave}>ГАРАХ</button></div></section></div>}
    </div>;
  return watching ? board : <VoiceChatProvider roomCode={roomCode} userId={userId} seats={seats} phase={game.phase === 'finished' ? 'results' : 'discussion'} alive isHost={isHost}>{board}</VoiceChatProvider>;
}

/** A player's piece on the board: their profile picture, or coloured initials, ringed in their colour. */
function Token({ player, color, isTurn, isMe }: { player: MonopolyPlayer; color?: string; isTurn: boolean; isMe: boolean }) {
  return <span className={`mono-token avatar-${player.color} ${player.avatarUrl ? 'has-photo' : ''} ${isTurn ? 'is-turn' : ''} ${isMe ? 'is-me' : ''}`}
    style={{ ...ownerStyle(color), ...(player.avatarUrl ? { backgroundImage: `url("${player.avatarUrl}")` } : {}) }} title={player.name} aria-label={player.name}>
    {!player.avatarUrl && player.initials.slice(0, 1)}
  </span>;
}

/** Everything that happened, as a chat: each line beside the player who did it, newest at the bottom. */
function MonoFeed({ game, mySeat }: { game: MonopolyState; mySeat: number | null }) {
  const list = useRef<HTMLOListElement>(null);
  const byLongestName = useMemo(() => [...game.players].sort((left, right) => right.name.length - left.name.length), [game.players]);
  const latest = game.log[game.log.length - 1];
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [game.log.length, latest]);
  return <ol className="mono-feed" ref={list} aria-label="Тоглолтын явц" aria-live="polite">
    {game.log.map((line, index) => {
      const who = byLongestName.find((entry) => line.startsWith(entry.name));
      const turnLine = Boolean(who) && /-ийн ээлж\.$/.test(line);
      const kind = turnLine ? 'is-turn-line' : who ? (who.id === mySeat ? 'is-mine' : 'from-player') : 'is-system';
      return <li key={`${index}-${line}`} className={`${kind} ${index === game.log.length - 1 ? 'is-latest' : ''}`}>
        {who && !turnLine && <Avatar name={who.name} color={who.color} url={who.avatarUrl} initials={who.initials} />}
        <span className="mono-feed-text">{who ? <><b>{who.name}</b>{line.slice(who.name.length)}</> : line}</span>
      </li>;
    })}
  </ol>;
}

function Die({ value, index }: { value: number; index: number }) {
  const pips: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  return <span className={`mono-die ${value ? 'is-rolled' : 'is-empty'} die-${index}`}>{Array.from({ length: 9 }, (_, cell) => <i key={cell} className={(pips[value] ?? []).includes(cell + 1) ? 'on' : ''} />)}</span>;
}

function PlayerRow({ entry, game, color, isTurn, isMe, frame, plateKey, borderKey, onProfile }: { entry: MonopolyPlayer; game: MonopolyState; color?: string; isTurn: boolean; isMe: boolean; frame?: string | null; plateKey?: string | null; borderKey?: string | null; onProfile: () => void }) {
  const owned = game.tiles.filter((tileState) => tileState.owner === entry.id).length;
  const plate = nameplate(plateKey);
  return <div className={`mono-player is-tappable ${isTurn ? 'is-turn' : ''} ${entry.bankrupt ? 'is-bankrupt' : ''} ${plate.className} ${rowBorderClass(borderKey)}`} style={{ ...ownerStyle(color), ...plate.style }} role="button" tabIndex={0}
    onClick={onProfile} onKeyDown={(event) => { if (event.key === 'Enter') onProfile(); }} aria-label={`${entry.name} — профайл`}>
    <RowBorder borderKey={borderKey} />
    <Avatar name={entry.name} color={entry.color} url={entry.avatarUrl} initials={entry.initials} frame={frame}>{entry.host && <i><Crown size={9} /></i>}<VoiceAvatarIndicator name={entry.name} seat={entry.id} /></Avatar>
    <span className="mono-player-copy"><b>{entry.name}{isMe && <small>ЧИ</small>}</b><span>{entry.bankrupt ? 'ДАМПУУРСАН' : `${entry.inJail ? 'ШОРОНД' : BOARD[entry.position].short} · ${owned} газар`}{!entry.bankrupt && (entry.jailCards?.length ?? 0) > 0 && <i className="mono-jail-card" title="Шоронгоос гарах карт"><KeyRound size={9} />{entry.jailCards!.length}</i>}</span></span>
    <span className="mono-player-money">{entry.bankrupt ? '—' : money(entry.money)}</span>
  </div>;
}

function MyTurn({ game, me, busy, onAction, onTrade }: { game: MonopolyState; me: MonopolyPlayer; busy: boolean; onAction: (move: string) => void; onTrade: () => void }) {
  const tile = BOARD[me.position];
  const rules = rulesOf(game);
  const left = offersLeft(game, me.id);
  const tradeButton = <button className="secondary-button" disabled={busy || left <= 0} onClick={onTrade} title={left <= 0 ? 'Энэ ээлжийн саналууд дууссан' : undefined}><ArrowLeftRight size={14} /> АРИЛЖАА</button>;
  const cards = me.jailCards?.length ?? 0;
  if (game.phase === 'roll') {
    return <div className="mono-turn">
      <p className="mono-turn-title">Таны ээлж{me.inJail ? ' · шоронд байна' : ''}</p>
      <button className="primary-button mono-big" disabled={busy} onClick={() => onAction('roll')}><Dices size={18} /> {me.inJail ? 'ХОС ХАЯЖ ГАРАХ' : 'ШОО ХАЯХ'}</button>
      {me.inJail
        ? <div className="mono-turn-row">
          {cards > 0 && <button className="secondary-button" disabled={busy} onClick={() => onAction('use-card')}><KeyRound size={14} /> КАРТААР ГАРАХ</button>}
          <button className="secondary-button" disabled={busy || me.money < JAIL_FINE} onClick={() => onAction('pay-jail')}><LockOpen size={14} /> {money(JAIL_FINE)} ТӨЛӨХ</button>
          {cards === 0 && tradeButton}
        </div>
        : <div className="mono-turn-row">{tradeButton}</div>}
      <p className="mono-hint">Газар дээр дарж гэр барих{rules.mortgage ? ', барьцаалах' : ''} боломжтой.</p>
    </div>;
  }
  if (game.phase === 'buy') {
    return <div className="mono-turn">
      <div className={`mono-offer ${tile.group ? `group-${tile.group}` : ''}`}><span className="mono-offer-band" /><b>{tile.name}</b><small>{tile.region}</small><strong>{money(tile.price!)}</strong></div>
      <button className="primary-button mono-big" disabled={busy || me.money < tile.price!} onClick={() => onAction('buy')}><HandCoins size={16} /> ХУДАЛДАЖ АВАХ</button>
      <button className="secondary-button" disabled={busy} onClick={() => onAction('decline')}>{rules.auction ? <><Gavel size={14} /> ДУУДЛАГА ХУДАЛДААНД</> : <>АВАХГҮЙ <ChevronRight size={14} /></>}</button>
      <p className="mono-hint">{me.money < tile.price! ? 'Мөнгө хүрэлцэхгүй байна. ' : ''}{rules.auction ? 'Авахгүй бол газар дуудлага худалдаанд гарч, хамгийн өндөр үнэ хаясан нь авна.' : 'Авахгүй бол газар эзэнгүй хэвээр үлдэнэ.'}</p>
    </div>;
  }
  if (me.inJail) {
    // Just sent to jail: get out now with the card or the fine, or wait and try for doubles next turn.
    return <div className="mono-turn">
      <p className="mono-turn-title"><Lock size={15} /> Шоронд орлоо</p>
      <div className="mono-turn-row">
        {cards > 0 && <button className="primary-button" disabled={busy} onClick={() => onAction('use-card')}><KeyRound size={14} /> КАРТААР ГАРАХ</button>}
        <button className="secondary-button" disabled={busy || me.money < JAIL_FINE} onClick={() => onAction('pay-jail')}><LockOpen size={14} /> {money(JAIL_FINE)} ТӨЛЖ ГАРАХ</button>
      </div>
      <button className="secondary-button" disabled={busy} onClick={() => onAction('end')}>ЭЭЛЖ ДУУСГАХ <ChevronRight size={15} /></button>
      <p className="mono-hint">Одоо гарахгүй бол дараагийн ээлжиндээ хос хаяж үзнэ. Гурав дахь оролдлогын дараа торгуулиа төлж гарна.</p>
    </div>;
  }
  return <div className="mono-turn">
    <p className="mono-turn-title">{tile.name}</p>
    <button className="primary-button mono-big" disabled={busy} onClick={() => onAction('end')}>{game.rollAgain ? <><Dices size={16} /> ДАХИН ХАЯХ (ХОС)</> : <>ЭЭЛЖ ДУУСГАХ <ChevronRight size={16} /></>}</button>
    <div className="mono-turn-row">{tradeButton}</div>
    <p className="mono-hint">Нэг өнгийн бүх газрыг эзэмшвэл тэр газар дээрээ дарж гэр барина.{rules.doubleRent ? ' Бүлгээ бүрдүүлсэн газрын түрээс 2 дахин өснө.' : ''}</p>
  </div>;
}

/** The auction for a deed nobody bought: whoever's turn it is raises or passes; a pass is final. */
function AuctionPanel({ game, auction, me, busy, onBid, onPass }: {
  game: MonopolyState; auction: AuctionState; me: MonopolyPlayer | null; busy: boolean; onBid: (amount: number) => void; onPass: () => void;
}) {
  const tile = BOARD[auction.tile];
  const bidderId = auction.bidders[auction.turn % Math.max(1, auction.bidders.length)];
  const name = (id: number | null) => game.players.find((entry) => entry.id === id)?.name ?? '';
  const minimum = minimumBid(auction);
  const mine = me !== null && bidderId === me.id;
  const steps = [...new Set([minimum, minimum + 40, minimum + 90])];
  const [typed, setTyped] = useState('');
  const typedAmount = Number(typed || 0);
  const typedProblem = !typed ? '' : typedAmount < minimum ? `Хамгийн багадаа ${money(minimum)}` : me && typedAmount > me.money ? 'Мөнгө хүрэлцэхгүй' : '';
  return <div className="mono-turn mono-auction">
    <div className={`mono-offer ${tile.group ? `group-${tile.group}` : ''}`}>
      <span className="mono-offer-band" />
      <b><Gavel size={13} /> {tile.name}</b>
      <small>Дуудлага худалдаа · үнэ нь {money(tile.price ?? 0)}</small>
      <strong>{auction.highBid ? <>{money(auction.highBid)} <em>{name(auction.highBidder)}</em></> : <em>Санал алга</em>}</strong>
    </div>
    <div className="mono-bidders">{auction.bidders.map((id) => <span key={id} className={`${id === bidderId ? 'is-bidding' : ''} ${id === auction.highBidder ? 'is-leading' : ''}`}>{name(id)}</span>)}</div>
    {mine ? <>
      <div className="mono-bid-row">
        {steps.map((amount) => <button key={amount} className="primary-button" disabled={busy || amount > me!.money} onClick={() => onBid(amount)}>{money(amount)}</button>)}
        <button className="secondary-button" disabled={busy} onClick={onPass}>ӨНЖИХ</button>
      </div>
      <form className="mono-amount-row" onSubmit={(event) => { event.preventDefault(); if (typed && !typedProblem) { onBid(typedAmount); setTyped(''); } }}>
        <label><input type="text" inputMode="numeric" pattern="[0-9]*" value={typed} placeholder={`Дүн бичих (${minimum}₮+)`} onChange={(event) => setTyped(digits(event.target.value))} aria-label="Үнийн санал" /><span>₮</span></label>
        <button type="submit" className="primary-button" disabled={busy || !typed || Boolean(typedProblem)}><Gavel size={13} /> ХАЯХ</button>
      </form>
      {typedProblem && <p className="mono-hint mono-amount-problem">{typedProblem}</p>}
    </> : <p className="mono-hint"><b>{name(bidderId)}</b> үнэ хаяж байна. {me && !me.bankrupt && !auction.bidders.includes(me.id) ? 'Та энэ дуудлагаас гарсан.' : 'Өнжвөл дахин оролцохгүй.'}</p>}
  </div>;
}

/** A trade offer on the table: the partner answers, the proposer may withdraw, everyone else watches. */
function TradePanel({ game, trade, me, busy, onAction }: { game: MonopolyState; trade: TradeOffer; me: MonopolyPlayer | null; busy: boolean; onAction: (move: string) => void }) {
  const name = (id: number) => game.players.find((entry) => entry.id === id)?.name ?? '';
  const interest = (tiles: number[]) => tiles.filter((tileId) => game.tiles[tileId].mortgaged).reduce((total, tileId) => total + mortgageInterest(tileId), 0);
  const fromSide = describeSide(trade.give, trade.giveCash, trade.giveCards);
  const toSide = describeSide(trade.get, trade.getCash, trade.getCards);
  if (me?.id === trade.to) {
    const owed = interest(trade.give);
    return <div className="mono-turn mono-trade-card">
      <p className="mono-turn-title"><Handshake size={15} /> {name(trade.from)} санал тавилаа</p>
      <dl className="mono-trade-sides"><div><dt>Та авна</dt><dd>{fromSide}</dd></div><div><dt>Та өгнө</dt><dd>{toSide}</dd></div></dl>
      {owed > 0 && <p className="mono-hint">Барьцаатай газар авбал банкинд {money(owed)} хүү шууд төлнө.</p>}
      <div className="mono-bid-row">
        <button className="primary-button" disabled={busy} onClick={() => onAction('accept')}>ЗӨВШӨӨРӨХ</button>
        <button className="secondary-button" disabled={busy} onClick={() => onAction('reject')}>ТАТГАЛЗАХ</button>
      </div>
    </div>;
  }
  if (me?.id === trade.from) {
    return <div className="mono-turn mono-trade-card">
      <p className="mono-turn-title"><Handshake size={15} /> Таны санал · {name(trade.to)}</p>
      <dl className="mono-trade-sides"><div><dt>Та өгнө</dt><dd>{fromSide}</dd></div><div><dt>Та авна</dt><dd>{toSide}</dd></div></dl>
      <p className="mono-hint">{name(trade.to)} хариу өгөхийг хүлээж байна.</p>
      <button className="secondary-button" disabled={busy} onClick={() => onAction('cancel-trade')}>САНАЛАА БУЦААХ</button>
    </div>;
  }
  return <div className="mono-turn mono-trade-card">
    <p className="mono-turn-title"><Handshake size={15} /> {name(trade.from)} ⇄ {name(trade.to)}</p>
    <dl className="mono-trade-sides"><div><dt>{name(trade.from)}</dt><dd>{fromSide}</dd></div><div><dt>{name(trade.to)}</dt><dd>{toSide}</dd></div></dl>
    <p className="mono-hint">{name(trade.to)} хариу өгөхийг хүлээж байна.</p>
  </div>;
}

/** Builds a trade offer: pick a partner, then the deeds, cash and jail cards each side puts up. */
function TradeComposer({ game, me, busy, onClose, onSend }: {
  game: MonopolyState; me: MonopolyPlayer; busy: boolean; onClose: () => void; onSend: (offer: TradeProposal) => void;
}) {
  const partners = game.players.filter((entry) => !entry.bankrupt && entry.id !== me.id);
  const [to, setTo] = useState<number | null>(partners[0]?.id ?? null);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const [giveCards, setGiveCards] = useState(0);
  const [getCards, setGetCards] = useState(0);
  const partner = partners.find((entry) => entry.id === to) ?? null;
  const choose = (id: number) => { setTo(id); setGet([]); setGetCash(0); setGetCards(0); };
  const empty = !give.length && !get.length && !giveCash && !getCash && !giveCards && !getCards;
  const owed = get.filter((tileId) => game.tiles[tileId].mortgaged).reduce((total, tileId) => total + mortgageInterest(tileId), 0);
  return <div className="mono-trade-backdrop" role="dialog" aria-modal="true" aria-label="Арилжаа">
    <section className="mono-trade">
      <header>
        <b><ArrowLeftRight size={15} /> АРИЛЖАА</b>
        <div className="mono-trade-partners">{partners.map((entry) => <button type="button" key={entry.id} className={entry.id === to ? 'is-picked' : ''} onClick={() => choose(entry.id)}>
          <Avatar name={entry.name} color={entry.color} url={entry.avatarUrl} initials={entry.initials} />{entry.name}
        </button>)}</div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Хаах"><X size={15} /></button>
      </header>
      <div className="mono-trade-columns">
        <TradeSide title="Та өгнө" owner={me} game={game} picked={give} onPick={setGive} cash={giveCash} onCash={setGiveCash} cards={giveCards} onCards={setGiveCards} />
        <TradeSide title={partner ? `${partner.name} өгнө` : 'Хамтрагч'} owner={partner} game={game} picked={get} onPick={setGet} cash={getCash} onCash={setGetCash} cards={getCards} onCards={setGetCards} />
      </div>
      <footer>
        <p className="mono-hint">{empty ? 'Газар, мөнгө эсвэл карт сонгоно уу. Барилгатай бүлгийн газрыг арилжаалахгүй.' : <>{describeSide(give, giveCash, giveCards)} <b>↔</b> {describeSide(get, getCash, getCards)}{owed ? ` · барьцааны хүү ${money(owed)}` : ''}</>}</p>
        <button type="button" className="secondary-button" onClick={onClose}>БОЛИХ</button>
        <button type="button" className="primary-button" disabled={busy || empty || !partner}
          onClick={() => partner && onSend({ to: partner.id, give, get, giveCash, getCash, giveCards, getCards })}><Handshake size={14} /> САНАЛ ИЛГЭЭХ</button>
      </footer>
    </section>
  </div>;
}

function TradeSide({ title, owner, game, picked, onPick, cash, onCash, cards, onCards }: {
  title: string; owner: MonopolyPlayer | null; game: MonopolyState; picked: number[]; onPick: (tiles: number[]) => void;
  cash: number; onCash: (value: number) => void; cards: number; onCards: (value: number) => void;
}) {
  const deeds = owner ? BOARD.filter((tile) => tile.price !== undefined && game.tiles[tile.id].owner === owner.id) : [];
  const limit = owner?.money ?? 0;
  const held = owner?.jailCards?.length ?? 0;
  const setCash = (value: number) => onCash(Math.max(0, Math.min(limit, Math.round(Number.isFinite(value) ? value : 0))));
  // What is typed is kept as text, so the field can be emptied and retyped without a stuck "0".
  const [typed, setTyped] = useState(cash ? String(cash) : '');
  useEffect(() => { setTyped((current) => Number(current || 0) === cash ? current : cash ? String(cash) : ''); }, [cash]);
  return <div className="mono-trade-side">
    <h4>{title}<small>{owner ? `${money(owner.money)} бэлэн` : ''}</small></h4>
    <div className="mono-trade-deeds">
      {deeds.length ? deeds.map((tile) => {
        const tradable = canTradeTile(game, tile.id);
        const chosen = picked.includes(tile.id);
        return <button type="button" key={tile.id} disabled={!tradable} title={tradable ? tile.name : 'Бүлэгт нь барилга байна'}
          className={`mono-deed ${tile.group ? `group-${tile.group}` : `kind-${tile.kind}`} ${chosen ? 'is-picked' : ''}`}
          onClick={() => onPick(chosen ? picked.filter((id) => id !== tile.id) : [...picked, tile.id])}>
          <span className="mono-deed-band" /><span>{tile.short}</span>{game.tiles[tile.id].mortgaged && <small>барьцаа</small>}
        </button>;
      }) : <p className="mono-hint">Газар алга.</p>}
      {held > 0 && <button type="button" className={`mono-deed is-card ${cards ? 'is-picked' : ''}`} onClick={() => onCards((cards + 1) % (held + 1))}>
        <KeyRound size={11} /><span>Шоронгийн карт{cards ? ` ×${cards}` : ''}</span>
      </button>}
    </div>
    <div className="mono-trade-cash">
      <button type="button" onClick={() => setCash(cash - 50)} disabled={cash <= 0} aria-label="50₮ хасах"><Minus size={13} /></button>
      <label><input type="text" inputMode="numeric" pattern="[0-9]*" value={typed} placeholder="0" onChange={(event) => { const value = digits(event.target.value); setTyped(value); setCash(Number(value || 0)); }} aria-label={`${title}: мөнгө`} />₮</label>
      <button type="button" onClick={() => setCash(cash + 50)} disabled={cash >= limit} aria-label="50₮ нэмэх"><Plus size={13} /></button>
    </div>
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
  const rules = rulesOf(game);
  const pot = game.pot ?? 0;
  const rows: Array<[string, ReactNode]> = [];
  if (tile.kind === 'property') {
    const rents = tile.rents!;
    rows.push(['Түрээс', money(rents[0])]);
    if (rules.doubleRent) rows.push(['Бүлгээрээ', money(rents[0] * 2)]);
    for (let houses = 1; houses <= 5; houses += 1) rows.push([houses === 5 ? 'Жуулчны бааз' : `${houses} гэр`, money(rents[houses])]);
    const supply = bankSupply(game);
    rows.push(['Гэр барих', money(tile.houseCost!)], ['Банкны гэр/бааз', `${supply.houses} / ${supply.hotels}`]);
  }
  if (tile.price !== undefined && rules.mortgage) rows.push(['Барьцаа', `+${money(mortgageValue(tile.id))} / −${money(unmortgageCost(tile.id))}`]);
  if (tile.kind === 'rail') rows.push(['1 / 2 / 3 / 4 эзэмшвэл', '25₮ / 50₮ / 100₮ / 200₮']);
  if (tile.kind === 'utility') rows.push(['1 эзэмшвэл', 'шоо × 4'], ['2 эзэмшвэл', 'шоо × 10']);
  const describe: Partial<Record<Tile['kind'], string>> = {
    start: `Эхлэлийг давах бүрт ${money(PASS_START_BONUS)} авна.`,
    jail: `Зочилж байгаа бол юу ч болохгүй. Шоронд орсон бол хос буулгах, ${money(JAIL_FINE)} төлөх эсвэл «Өршөөл» картаар гарна. Гурав дахь оролдлогын дараа торгуулиа төлж гарна.${rules.prisonNoRent ? ' Шоронд байх хугацаандаа түрээс авахгүй.' : ''}`,
    parking: rules.vacationCash
      ? `Наадмын сан: татвар, торгууль, картын төлбөр энд хуримтлагдаж, энд буусан тоглогч бүгдийг нь авна. Одоо ${money(pot)}.`
      : 'Наадмын амралт. Юу ч болохгүй.',
    gotojail: 'Шууд шоронд очно. Эхлэлийг давсанд тооцохгүй.', chance: 'Хувь тавилангийн карт сугална.',
    chest: 'Эрдэнэсийн авдрын карт сугална.',
    tax: `${tile.taxPercent ? `Бэлэн мөнгөнийхөө ${tile.taxPercent}%-ийг` : `${money(tile.rent ?? 0)}`} татвар төлнө.${rules.vacationCash ? ' Татвар Наадмын санд орно.' : ''}`,
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
      {rules.mortgage && !tileState.mortgaged && tileState.houses === 0 && !group.some((other) => game.tiles[other].houses > 0) && <button className="secondary-button" disabled={busy} onClick={() => onAction('mortgage')}>БАРЬЦААЛАХ +{money(mortgageValue(tile.id))}</button>}
      {tileState.mortgaged && <button className="secondary-button" disabled={busy} onClick={() => onAction('unmortgage')}>БАРЬЦААНААС ГАРГАХ −{money(unmortgageCost(tile.id))}</button>}
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
