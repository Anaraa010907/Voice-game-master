import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  MIN_PLAYERS, allNightActionsSubmitted, allVerdictsSubmitted, allVotesSubmitted, createInitialGame, finishDay, openDiscussion,
  privateView, publicView, recordVerdict, recordVote, removePlayer, resolveNight, resolveTrial, resolveVoting, startNight, startVoting,
  submitNightAction, type GameEngineState, type Verdict, type VoteChoice,
} from '../_shared/gameEngine.ts';
import {
  MIN_MONOPOLY_PLAYERS, applyMonopolyAction, autoPlay, createMonopolyGame, removeMonopolyPlayer,
  type MonopolyAction, type MonopolyState,
} from '../_shared/monopolyEngine.ts';
import { BOT_STEP_SECONDS, boardBotToMove, mafiaBotsAct, monopolyBotStep, nextBotName } from '../_shared/bots.ts';
import { isAllowedOrigin } from '../_shared/voiceRequest.ts';
import type { VoicePhase } from '../_shared/voicePolicy.ts';

/*
 * Authoritative game server. Clients send intents; this function validates them against the
 * engine, stores the full state server-side, and publishes a public view plus one private view
 * per player. Realtime pushes those rows to the right people under RLS.
 */

type GameType = 'mafia' | 'monopoly';
type Room = { room_code: string; name: string; host_id: string; max_players: number; is_private: boolean; status: 'lobby' | 'playing' | 'finished'; game_type: GameType };
/** The stored engine also carries the match id used to record win/loss statistics exactly once. */
type StoredGame = GameEngineState & { matchId?: string };
type StoredBoard = MonopolyState & { matchId?: string };
type AnyGame = StoredGame | StoredBoard;
const isBoard = (state: AnyGame): state is StoredBoard => (state as StoredBoard).kind === 'monopoly';
const GAME_TYPES: GameType[] = ['mafia', 'monopoly'];
const ROOM_SIZES: Record<GameType, number[]> = { mafia: [6, 8, 10, 12], monopoly: [2, 3, 4, 5, 6] };
const MIN_SEATS: Record<GameType, number> = { mafia: MIN_PLAYERS, monopoly: MIN_MONOPOLY_PLAYERS };
/** Seconds each board-game player has for every step (roll, buy, finish turn). */
const BOARD_STEP_SECONDS = 40;
/** Seconds a bidder has at an auction before passing, and a player has to answer a trade offer. */
const BOARD_BID_SECONDS = 15;
const BOARD_TRADE_SECONDS = 30;
const BOARD_ACTIONS = ['roll', 'buy', 'decline', 'end', 'pay-jail', 'use-card', 'build', 'sell', 'mortgage', 'unmortgage', 'bid', 'pass', 'propose', 'accept', 'reject', 'cancel-trade'];
const TILE_ACTIONS = ['build', 'sell', 'mortgage', 'unmortgage'];
const LISTED_LOBBY_HOURS = 6;
/** Which games let the host fill seats with bots. Mafia bots are a testing aid: set mafia to false to remove them. */
const BOTS_ALLOWED: Record<GameType, boolean> = { mafia: true, monopoly: true };
type Seat = { user_id: string; seat: number; display_name: string; color: string; ready: boolean; avatar_url?: string | null; is_bot?: boolean };
type Body = Record<string, unknown>;

class GameError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const PHASE_SECONDS: Record<string, number> = {
  'Role Reveal': 20,
  Night: 60,
  Morning: 15,
  Voting: 45,
  Runoff: 30,
  /** The accused defends themselves while everyone else gives a verdict. */
  Trial: 35,
  VoteReveal: 10,
};
const COLORS = ['rose', 'violet', 'gold', 'teal', 'blue', 'plum'];

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let index = 0; index < 4; index += 1) suffix += alphabet[Math.floor(secureRandom() * alphabet.length)];
  return `NIGHT-${suffix}`;
}

async function hashPassword(code: string, password: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mafia-shadows:${code}:${password}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function text(body: Body, key: string, max: number, required = true) {
  const value = body[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new GameError(400, 'Хүсэлтийн талбар буруу байна.');
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > max) throw new GameError(400, 'Хүсэлтийн талбар буруу байна.');
  return trimmed;
}

/** Two players called "Бат" at one table become "Бат" and "Бат 2", so votes and voice labels stay clear. */
function uniqueName(name: string, taken: string[]) {
  const used = new Set(taken.map((entry) => entry.trim().toLowerCase()));
  if (!used.has(name.trim().toLowerCase())) return name;
  for (let index = 2; index < 20; index += 1) {
    const candidate = `${name.slice(0, 21)} ${index}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

function code(body: Body) {
  const value = text(body, 'roomCode', 32).toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(value)) throw new GameError(400, 'Өрөөний код буруу байна.');
  return value;
}

const whole = (value: unknown, max: number) => {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 0 && number <= max ? number : null;
};

/** Turns a validated board move into an engine action; the engine then checks it against the rules. */
function boardAction(move: string, body: Body): MonopolyAction {
  if (TILE_ACTIONS.includes(move)) {
    const tile = whole(body.tile, 31);
    if (tile === null) throw new GameError(400, 'Нүд буруу байна.');
    return { type: move, tile } as MonopolyAction;
  }
  if (move === 'bid') {
    const amount = whole(body.amount, 1_000_000);
    if (!amount) throw new GameError(400, 'Үнийн санал буруу байна.');
    return { type: 'bid', amount };
  }
  if (move === 'propose') {
    const offer = (body.offer ?? {}) as Body;
    const tiles = (value: unknown) => Array.isArray(value) && value.length <= 32 && value.every((tile) => whole(tile, 31) !== null) ? value.map(Number) : null;
    const to = whole(offer.to, 99);
    const give = tiles(offer.give ?? []);
    const get = tiles(offer.get ?? []);
    const giveCash = whole(offer.giveCash ?? 0, 1_000_000);
    const getCash = whole(offer.getCash ?? 0, 1_000_000);
    const giveCards = whole(offer.giveCards ?? 0, 2);
    const getCards = whole(offer.getCards ?? 0, 2);
    if (to === null || !give || !get || giveCash === null || getCash === null || giveCards === null || getCards === null) throw new GameError(400, 'Арилжааны санал буруу байна.');
    return { type: 'propose', offer: { to, give, get, giveCash, getCash, giveCards, getCards } };
  }
  return { type: move } as MonopolyAction;
}

function deadlineFor(state: AnyGame): string | null {
  if (isBoard(state)) {
    if (state.phase === 'finished') return null;
    // A bot "thinks" for a moment; whoever's phone sees the timer run out asks the server to move it.
    const seconds = boardBotToMove(state) ? BOT_STEP_SECONDS
      : state.trade ? BOARD_TRADE_SECONDS : state.phase === 'auction' ? BOARD_BID_SECONDS : BOARD_STEP_SECONDS;
    return new Date(Date.now() + seconds * 1000).toISOString();
  }
  if (state.phase === 'Results') return null;
  const key = state.phase === 'Voting'
    ? state.votesRevealed ? 'VoteReveal' : state.trial ? 'Trial' : state.runoffCandidates ? 'Runoff' : 'Voting'
    : state.phase;
  return new Date(Date.now() + phaseSeconds(state, key) * 1000).toISOString();
}

/** Discussion grows with the table: about 15 seconds per living player, between 75 s and 3 minutes. */
export function discussionSeconds(living: number) {
  return Math.min(180, Math.max(75, 40 + living * 15));
}

function phaseSeconds(state: GameEngineState, key: string) {
  if (key === 'Discussion') return discussionSeconds(state.publicPlayers.filter((player) => player.alive).length);
  return PHASE_SECONDS[key];
}

/** Moves the game one step forward when its phase is over. */
function advance(state: GameEngineState): GameEngineState {
  switch (state.phase) {
    case 'Role Reveal': return startNight(state);
    case 'Night': return resolveNight(state, secureRandom).state;
    case 'Morning': return openDiscussion(state);
    case 'Discussion': return startVoting(state);
    case 'Voting': return state.votesRevealed ? finishDay(state) : state.trial ? resolveTrial(state).state : resolveVoting(state).state;
    default: return state;
  }
}

/** Skips waiting when everyone who must act already has. */
function settle(state: GameEngineState): GameEngineState {
  if (state.phase === 'Night' && !state.nightResolved && allNightActionsSubmitted(state)) return advance(state);
  if (state.phase === 'Voting' && !state.votesRevealed && (state.trial ? allVerdictsSubmitted(state) : allVotesSubmitted(state))) return advance(state);
  return state;
}

/** Lets bots act in every phase that opens, then skips waiting, until nothing more happens. */
function progress(state: GameEngineState): GameEngineState {
  let current = state;
  for (let step = 0; step < 8; step += 1) {
    const next = settle(mafiaBotsAct(current, secureRandom));
    if (next === current) return current;
    current = next;
  }
  return current;
}

// Board games keep voice open for everyone the whole match.
const voicePhase = (state: AnyGame): VoicePhase => isBoard(state)
  ? state.phase === 'finished' ? 'results' : 'discussion'
  : state.phase === 'Role Reveal' ? 'role-reveal' : state.phase.toLowerCase() as VoicePhase;
const isFinished = (state: AnyGame) => isBoard(state) ? state.phase === 'finished' : state.phase === 'Results';
const gameType = (value: unknown): GameType => GAME_TYPES.includes(value as GameType) ? value as GameType : 'mafia';

class GameServer {
  constructor(private admin: SupabaseClient, private userId: string) {}

  async room(roomCode: string): Promise<Room> {
    const { data, error } = await this.admin.from('game_rooms').select('*').eq('room_code', roomCode).maybeSingle();
    if (error) throw error;
    if (!data) throw new GameError(404, 'Өрөө олдсонгүй.');
    return data as Room;
  }

  async seats(roomCode: string): Promise<Seat[]> {
    const { data, error } = await this.admin.from('game_room_players').select('user_id,seat,display_name,color,ready,avatar_url,is_bot').eq('room_code', roomCode).order('seat');
    if (error) throw error;
    return (data ?? []) as Seat[];
  }

  async profile() {
    const { data, error } = await this.admin.from('profiles').select('display_name,avatar_key,avatar_url').eq('id', this.userId).maybeSingle();
    // Seating still works without a profile, but say so loudly: a missing grant once made everyone "Тоглогч".
    if (error) console.error('profile read failed', error);
    return { url: (data?.avatar_url as string | null | undefined) ?? null, name: (data?.display_name as string | undefined)?.slice(0, 24) || 'Тоглогч', color: COLORS.includes(data?.avatar_key as string) ? data!.avatar_key as string : 'rose' };
  }

  async touchRoom(roomCode: string, patch: Partial<Room> = {}) {
    const { error } = await this.admin.from('game_rooms').update({ ...patch, updated_at: new Date().toISOString() }).eq('room_code', roomCode);
    if (error) throw error;
  }

  async addVoiceMember(roomCode: string, seat: Seat, isHost: boolean) {
    await this.admin.from('voice_room_members').upsert({ room_code: roomCode, user_id: seat.user_id, participant_name: seat.display_name, is_host: isHost, is_alive: true, is_muted: false });
  }

  async create(body: Body) {
    const name = text(body, 'name', 32);
    const type = gameType(body.gameType);
    const maxPlayers = Number(body.maxPlayers);
    if (!ROOM_SIZES[type].includes(maxPlayers)) throw new GameError(400, 'Тоглогчийн тоо буруу байна.');
    // Public rooms appear in the room list; private rooms are joined by code only (optionally with a password).
    const isPrivate = body.isPublic === true ? false : body.isPrivate !== false;
    const password = isPrivate ? text(body, 'password', 32, false) : '';
    if (password && password.length < 4) throw new GameError(400, 'Өрөөний нууц үг хамгийн багадаа 4 тэмдэгт байна.');
    const me = await this.profile();
    await this.closeIdleRoomsOfHost();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const roomCodeValue = roomCode();
      const { error } = await this.admin.from('game_rooms').insert({ room_code: roomCodeValue, name, host_id: this.userId, max_players: maxPlayers, is_private: isPrivate, game_type: type });
      if (error?.code === '23505') continue;
      if (error) throw error;
      const seat: Seat = { user_id: this.userId, seat: 1, display_name: me.name, color: me.color, ready: true, avatar_url: me.url };
      const results = await Promise.all([
        this.admin.from('game_states').insert({ room_code: roomCodeValue, password_hash: password ? await hashPassword(roomCodeValue, password) : null }),
        this.admin.from('game_room_players').insert({ room_code: roomCodeValue, ...seat }),
        this.admin.from('voice_rooms').upsert({ room_code: roomCodeValue, game_phase: 'lobby', post_game_voice: false }),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      await this.addVoiceMember(roomCodeValue, seat, true);
      return { roomCode: roomCodeValue };
    }
    throw new GameError(503, 'Өрөөний код үүсгэж чадсангүй. Дахин оролдоно уу.');
  }

  /** A host has at most one waiting room: earlier lobbies they abandoned (closed the app, lost signal) are removed. */
  private async closeIdleRoomsOfHost() {
    const { data } = await this.admin.from('game_rooms').select('room_code').eq('host_id', this.userId).neq('status', 'playing');
    const codes = (data ?? []).map((row: { room_code: string }) => row.room_code);
    if (!codes.length) return;
    await this.admin.from('voice_rooms').delete().in('room_code', codes);
    await this.admin.from('game_rooms').delete().in('room_code', codes);
  }

  async join(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    const seats = await this.seats(roomCodeValue);
    if (seats.some((seat) => seat.user_id === this.userId)) return { roomCode: roomCodeValue };
    if (room.status !== 'lobby') throw new GameError(409, 'Энэ өрөөнд тоглоом аль хэдийн эхэлсэн байна.');
    if (seats.length >= room.max_players) throw new GameError(409, 'Энэ өрөө дүүрсэн байна.');
    const { data: secret } = await this.admin.from('game_states').select('password_hash').eq('room_code', roomCodeValue).maybeSingle();
    if (secret?.password_hash) {
      const password = typeof body.password === 'string' ? body.password : '';
      if (await hashPassword(roomCodeValue, password) !== secret.password_hash) throw new GameError(403, 'Өрөөний нууц үг таарахгүй байна.');
    }
    const me = await this.profile();
    const taken = new Set(seats.map((seat) => seat.seat));
    const free = Array.from({ length: room.max_players }, (_, index) => index + 1).find((seat) => !taken.has(seat));
    if (!free) throw new GameError(409, 'Энэ өрөө дүүрсэн байна.');
    const seat: Seat = { user_id: this.userId, seat: free, display_name: uniqueName(me.name, seats.map((other) => other.display_name)), color: me.color, ready: false, avatar_url: me.url };
    const { error } = await this.admin.from('game_room_players').insert({ room_code: roomCodeValue, ...seat });
    if (error?.code === '23505') throw new GameError(409, 'Суудал дөнгөж сая дүүрлээ. Дахин оролдоно уу.');
    if (error) throw error;
    await this.addVoiceMember(roomCodeValue, seat, false);
    await this.touchRoom(roomCodeValue);
    return { roomCode: roomCodeValue };
  }

  async requireSeat(roomCode: string) {
    const seats = await this.seats(roomCode);
    const mine = seats.find((seat) => seat.user_id === this.userId);
    if (!mine) throw new GameError(403, 'Та энэ өрөөний тоглогч биш байна.');
    return { seats, mine };
  }

  async ready(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    if (room.status !== 'lobby') throw new GameError(409, 'Тоглоом аль хэдийн эхэлсэн.');
    await this.requireSeat(roomCodeValue);
    const { error } = await this.admin.from('game_room_players').update({ ready: body.ready === true }).eq('room_code', roomCodeValue).eq('user_id', this.userId);
    if (error) throw error;
    await this.touchRoom(roomCodeValue);
    return { ready: body.ready === true };
  }

  async leave(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    const { seats, mine } = await this.requireSeat(roomCodeValue);
    // Bots never keep a room alive or become its host.
    const remaining = seats.filter((seat) => seat.user_id !== this.userId && !seat.is_bot);

    if (room.status === 'playing') {
      // Leaving a live game counts as a loss, recorded first so the final tally cannot turn it into a win.
      const { data: stored } = await this.admin.from('game_states').select('engine').eq('room_code', roomCodeValue).maybeSingle();
      const game = stored?.engine as AnyGame | null;
      if (game && !isFinished(game)) await this.recordOutcome(this.userId, 'loss', game.matchId);
      // If the leaver was the last one the phase was waiting on, the game moves on right away.
      await this.mutate(roomCodeValue, (state) => isBoard(state) ? removeMonopolyPlayer(state, mine.seat) : progress(removePlayer(state, mine.seat)));
    }
    await Promise.all([
      this.admin.from('game_room_players').delete().eq('room_code', roomCodeValue).eq('user_id', this.userId),
      this.admin.from('game_private').delete().eq('room_code', roomCodeValue).eq('user_id', this.userId),
      this.admin.from('voice_room_members').delete().eq('room_code', roomCodeValue).eq('user_id', this.userId),
    ]);
    // The host leaving a room that is not mid-game closes it for everyone; a live game keeps going under a new host.
    if (!remaining.length || (room.host_id === this.userId && room.status !== 'playing')) {
      await this.admin.from('voice_rooms').delete().eq('room_code', roomCodeValue);
      await this.admin.from('game_rooms').delete().eq('room_code', roomCodeValue);
      return { left: true, closed: true };
    }
    if (room.host_id === this.userId) {
      const nextHost = remaining[0];
      await this.touchRoom(roomCodeValue, { host_id: nextHost.user_id });
      await this.admin.from('voice_room_members').update({ is_host: true }).eq('room_code', roomCodeValue).eq('user_id', nextHost.user_id);
    } else {
      await this.touchRoom(roomCodeValue);
    }
    return { left: true };
  }

  async start(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    if (room.host_id !== this.userId) throw new GameError(403, 'Зөвхөн өрөөний эзэн тоглоом эхлүүлнэ.');
    if (room.status === 'playing') throw new GameError(409, 'Тоглоом аль хэдийн эхэлсэн.');
    const seats = await this.seats(roomCodeValue);
    const minimum = MIN_SEATS[room.game_type ?? 'mafia'];
    if (seats.length < minimum) throw new GameError(409, `Тоглоом эхлүүлэхэд дор хаяж ${minimum} тоглогч хэрэгтэй.`);
    const notReady = seats.filter((seat) => seat.user_id !== room.host_id && !seat.ready);
    if (notReady.length) throw new GameError(409, `Бэлэн болоогүй: ${notReady.map((seat) => seat.display_name).join(', ')}`);

    const people = seats.map((seat) => ({
      id: seat.seat,
      name: seat.display_name,
      initials: seat.display_name.slice(0, 2).toUpperCase(),
      color: seat.color,
      avatarUrl: seat.avatar_url ?? null,
      host: seat.user_id === room.host_id,
      bot: seat.is_bot === true,
    }));
    const engine: AnyGame = room.game_type === 'monopoly'
      ? { ...createMonopolyGame(people, secureRandom), matchId: crypto.randomUUID() }
      : { ...createInitialGame(people, undefined, secureRandom), matchId: crypto.randomUUID() };
    await this.admin.from('game_private').delete().eq('room_code', roomCodeValue);
    const { error } = await this.admin.from('game_states').update({ engine, version: 1, updated_at: new Date().toISOString() }).eq('room_code', roomCodeValue);
    if (error) throw error;
    await this.touchRoom(roomCodeValue, { status: 'playing' });
    await this.admin.from('voice_room_members').update({ is_alive: true }).eq('room_code', roomCodeValue);
    await this.publish(roomCodeValue, engine, seats, 1);
    return { started: true };
  }

  /** Read-modify-write with optimistic locking so simultaneous actions never overwrite each other. */
  async mutate(roomCode: string, change: (state: AnyGame, seats: Seat[]) => AnyGame) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = await this.admin.from('game_states').select('engine,version').eq('room_code', roomCode).maybeSingle();
      if (error) throw error;
      if (!data?.engine) throw new GameError(409, 'Тоглоом эхлээгүй байна.');
      const seats = await this.seats(roomCode);
      const current = data.engine as AnyGame;
      const next = change(current, seats);
      if (next === current) return current;
      const { data: written, error: writeError } = await this.admin.from('game_states')
        .update({ engine: next, version: data.version + 1, updated_at: new Date().toISOString() })
        .eq('room_code', roomCode).eq('version', data.version).select('version');
      if (writeError) throw writeError;
      if (!written?.length) continue;
      await this.publish(roomCode, next, seats, data.version + 1, current);
      if (isFinished(next) && !isFinished(current)) await this.recordResults(next, seats);
      return next;
    }
    throw new GameError(409, 'Олон хүсэлт зэрэг ирлээ. Дахин оролдоно уу.');
  }

  async publish(roomCode: string, state: AnyGame, seats: Seat[], version: number, previous?: AnyGame) {
    if (isBoard(state)) return this.publishBoard(roomCode, state, seats, version, previous as StoredBoard | undefined);
    const prior = previous as StoredGame | undefined;
    const phaseChanged = !prior || prior.phase !== state.phase || prior.votesRevealed !== state.votesRevealed
      || prior.runoffCandidates?.join() !== state.runoffCandidates?.join() || prior.round !== state.round
      || prior.trial?.accusedId !== state.trial?.accusedId;
    const { data: currentPublic } = await this.admin.from('game_public').select('deadline').eq('room_code', roomCode).maybeSingle();
    const deadline = phaseChanged ? deadlineFor(state) : currentPublic?.deadline ?? deadlineFor(state);
    const writes = [
      this.admin.from('game_public').upsert({ room_code: roomCode, view: publicView(state), deadline, version, updated_at: new Date().toISOString() }),
      this.admin.from('game_private').upsert(seats
        .filter((seat) => !seat.is_bot && state.privatePlayers[seat.seat])
        .map((seat) => ({ room_code: roomCode, user_id: seat.user_id, view: privateView(state, seat.seat), version }))),
    ];
    const results = await Promise.all(writes);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    if (state.phase === 'Results' && prior?.phase !== 'Results') await this.touchRoom(roomCode, { status: 'finished' });
    if (phaseChanged || prior?.publicPlayers.some((player, index) => player.alive !== state.publicPlayers[index]?.alive)) {
      await this.syncVoice(roomCode, state, seats);
    }
  }

  /** Board games have no secrets: the whole state is the public view. Every step resets the turn timer. */
  async publishBoard(roomCode: string, state: StoredBoard, seats: Seat[], version: number, previous?: StoredBoard) {
    const { matchId: _matchId, ...view } = state;
    const { error } = await this.admin.from('game_public').upsert({ room_code: roomCode, view, deadline: deadlineFor(state), version, updated_at: new Date().toISOString() });
    if (error) throw error;
    if (state.phase === 'finished' && previous?.phase !== 'finished') await this.touchRoom(roomCode, { status: 'finished' });
    if (!previous || (state.phase === 'finished') !== (previous.phase === 'finished')) await this.syncVoice(roomCode, state, seats);
  }

  /** Mirrors phase and life/death into the voice tables, then asks LiveKit to apply permissions. */
  async syncVoice(roomCode: string, state: AnyGame, seats: Seat[]) {
    try {
      const phase = voicePhase(state);
      await this.admin.from('voice_rooms').update({ game_phase: phase, post_game_voice: phase === 'results', updated_at: new Date().toISOString() }).eq('room_code', roomCode);
      for (const seat of seats) {
        if (seat.is_bot) continue;
        const alive = isBoard(state) ? true : state.publicPlayers.find((player) => player.id === seat.seat)?.alive ?? false;
        await this.admin.from('voice_room_members').update({ is_alive: alive }).eq('room_code', roomCode).eq('user_id', seat.user_id);
      }
      const controller = Deno.env.get('ROOM_CONTROLLER_SECRET');
      if (!controller) return;
      await fetch(`${env('SUPABASE_URL')}/functions/v1/livekit-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('SUPABASE_ANON_KEY')}`, apikey: env('SUPABASE_ANON_KEY'), 'x-room-controller-key': controller },
        body: JSON.stringify(phase === 'results' ? { action: 'sync', roomCode, phase, postGameVoice: true } : { action: 'sync', roomCode, phase }),
      });
    } catch (error) {
      // Voice permissions are best-effort; the game itself must keep going.
      console.error('voice sync failed', error);
    }
  }

  /** Adds the win or loss to the player's profile statistics. Idempotent per match and player. */
  async recordOutcome(userId: string, outcome: 'win' | 'loss', matchId?: string) {
    if (!matchId) return;
    const { error } = await this.admin.rpc('process_verified_competitive_match', {
      p_match_id: matchId, p_user_id: userId, p_outcome: outcome, p_match_completed: true, p_match_valid: true,
    });
    if (error) console.error('stats update failed', error);
  }

  async recordResults(state: AnyGame, seats: Seat[]) {
    if (isBoard(state)) {
      for (const seat of seats) {
        if (seat.is_bot || !state.players.some((entry) => entry.id === seat.seat)) continue;
        await this.recordOutcome(seat.user_id, state.winner === seat.seat ? 'win' : 'loss', state.matchId);
      }
      return;
    }
    if (!state.winner) return;
    for (const seat of seats) {
      const secret = state.privatePlayers[seat.seat];
      if (!secret || seat.is_bot) continue;
      const won = (state.winner === 'Mafia') === (secret.team === 'mafia');
      await this.recordOutcome(seat.user_id, won ? 'win' : 'loss', state.matchId);
    }
  }

  /** Open public lobbies that still have a free seat, fullest first. */
  async list(body: Body = {}) {
    const type = gameType(body.gameType);
    const since = new Date(Date.now() - LISTED_LOBBY_HOURS * 3600 * 1000).toISOString();
    const { data: rooms, error } = await this.admin.from('game_rooms')
      .select('room_code,name,host_id,max_players,updated_at')
      .eq('status', 'lobby').eq('is_private', false).eq('game_type', type).gte('updated_at', since)
      .order('updated_at', { ascending: false }).limit(50);
    if (error) throw error;
    type ListedRow = { room_code: string; name: string; host_id: string; max_players: number };
    type SeatedRow = { room_code: string; user_id: string; display_name: string };
    const roomRows = (rooms ?? []) as ListedRow[];
    const codes = roomRows.map((room) => room.room_code);
    if (!codes.length) return { rooms: [] };
    const { data: players, error: playerError } = await this.admin.from('game_room_players').select('room_code,user_id,display_name').in('room_code', codes);
    if (playerError) throw playerError;
    const playerRows = (players ?? []) as SeatedRow[];
    const listed = roomRows.map((room) => {
      const seated = playerRows.filter((player) => player.room_code === room.room_code);
      return {
        roomCode: room.room_code,
        name: room.name,
        players: seated.length,
        maxPlayers: room.max_players,
        hostName: seated.find((player) => player.user_id === room.host_id)?.display_name ?? '—',
        joined: seated.some((player) => player.user_id === this.userId),
      };
    }).filter((room) => room.players > 0 && (room.players < room.maxPlayers || room.joined));
    listed.sort((left, right) => right.players - left.players);
    return { rooms: listed.slice(0, 30) };
  }

  /** Joins the public lobby closest to starting. */
  async quick(body: Body = {}) {
    const { rooms } = await this.list(body);
    const pick = rooms.find((room) => room.players < room.maxPlayers && !room.joined);
    if (!pick) return { roomCode: null };
    return this.join({ roomCode: pick.roomCode });
  }

  /** One board-game move: the current player's turn, a bid at an auction, or an answer to a trade offer. */
  async board(body: Body) {
    const roomCodeValue = code(body);
    const { mine } = await this.requireSeat(roomCodeValue);
    const move = typeof body.move === 'string' && BOARD_ACTIONS.includes(body.move) ? body.move : null;
    if (!move) throw new GameError(400, 'Үйлдэл буруу байна.');
    const action = boardAction(move, body);
    let failure = '';
    await this.mutate(roomCodeValue, (state) => {
      if (!isBoard(state)) { failure = 'Энэ өрөөнд board game явагдаагүй байна.'; return state; }
      const result = applyMonopolyAction(state, mine.seat, action, secureRandom);
      failure = result.error ?? '';
      return result.error ? state : result.state;
    });
    if (failure) throw new GameError(409, failure);
    return { ok: true };
  }

  async night(body: Body) {
    const roomCodeValue = code(body);
    const { mine } = await this.requireSeat(roomCodeValue);
    const targetId = Number(body.targetId);
    if (!Number.isInteger(targetId)) throw new GameError(400, 'Зорилт буруу байна.');
    let failure = '';
    await this.mutate(roomCodeValue, (state) => {
      if (isBoard(state)) return state;
      const result = submitNightAction(state, mine.seat, targetId);
      failure = result.error ?? '';
      return result.error ? state : progress(result.state);
    });
    if (failure) throw new GameError(409, failure);
    return { ok: true };
  }

  /** Guilty or innocent, from a living player other than the accused, while a trial is open. */
  async verdict(body: Body) {
    const roomCodeValue = code(body);
    const { mine } = await this.requireSeat(roomCodeValue);
    const choice = body.choice === 'guilty' || body.choice === 'innocent' ? body.choice as Verdict : null;
    if (!choice) throw new GameError(400, 'Шийдвэр буруу байна.');
    let failure = '';
    await this.mutate(roomCodeValue, (state) => {
      if (isBoard(state)) return state;
      const result = recordVerdict(state, mine.seat, choice);
      failure = result.error ?? '';
      return result.error ? state : progress(result.state);
    });
    if (failure) throw new GameError(409, failure);
    return { ok: true };
  }

  async vote(body: Body) {
    const roomCodeValue = code(body);
    const { mine } = await this.requireSeat(roomCodeValue);
    const choice: VoteChoice = body.choice === 'skip' ? 'skip' : Number.isInteger(body.choice) ? body.choice as number : null;
    let failure = '';
    await this.mutate(roomCodeValue, (state) => {
      if (isBoard(state)) return state;
      const result = recordVote(state, mine.seat, choice);
      failure = result.error ?? '';
      return result.error ? state : progress(result.state);
    });
    if (failure) throw new GameError(409, failure);
    return { ok: true };
  }

  /** Any player may nudge the clock once the deadline passes; the host may also skip a waiting phase. */
  async tick(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    await this.requireSeat(roomCodeValue);
    if (room.status !== 'playing') return { ok: true };
    const { data: pub } = await this.admin.from('game_public').select('deadline').eq('room_code', roomCodeValue).maybeSingle();
    const expired = pub?.deadline ? Date.parse(pub.deadline) <= Date.now() + 500 : false;
    const hostSkip = body.skip === true && room.host_id === this.userId;
    await this.mutate(roomCodeValue, (state) => {
      // On a bot's turn the bot plays a real step; for a human who ran out of time the safe default is taken.
      if (isBoard(state)) return !expired ? state : boardBotToMove(state) ? monopolyBotStep(state, secureRandom) : autoPlay(state, secureRandom);
      const skippable = state.phase === 'Role Reveal' || state.phase === 'Morning' || state.phase === 'Discussion' || (state.phase === 'Voting' && state.votesRevealed);
      if (!expired && !(hostSkip && skippable)) return state;
      return progress(advance(state));
    });
    return { ok: true };
  }

  /** Host-only: seats a bot in the lobby. */
  async addBot(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    if (room.host_id !== this.userId) throw new GameError(403, 'Зөвхөн өрөөний эзэн бот нэмнэ.');
    if (!BOTS_ALLOWED[room.game_type ?? 'mafia']) throw new GameError(409, 'Энэ тоглоомд бот нэмэх боломжгүй.');
    if (room.status !== 'lobby') throw new GameError(409, 'Тоглоом эхэлсэн үед бот нэмэх боломжгүй.');
    const seats = await this.seats(roomCodeValue);
    if (seats.length >= room.max_players) throw new GameError(409, 'Өрөө дүүрсэн байна.');
    const taken = new Set(seats.map((seat) => seat.seat));
    const free = Array.from({ length: room.max_players }, (_, index) => index + 1).find((seat) => !taken.has(seat))!;
    const name = nextBotName(seats.map((seat) => seat.display_name));
    const { error } = await this.admin.from('game_room_players').insert({
      room_code: roomCodeValue, user_id: crypto.randomUUID(), seat: free, display_name: name,
      color: COLORS[(free - 1) % COLORS.length], ready: true, avatar_url: null, is_bot: true,
    });
    if (error?.code === '23505') throw new GameError(409, 'Суудал дөнгөж сая дүүрлээ. Дахин оролдоно уу.');
    if (error) throw error;
    await this.touchRoom(roomCodeValue);
    return { seat: free, name };
  }

  /** Host-only: frees a bot's seat in the lobby. */
  async removeBot(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    if (room.host_id !== this.userId) throw new GameError(403, 'Зөвхөн өрөөний эзэн бот хасна.');
    if (room.status !== 'lobby') throw new GameError(409, 'Тоглоом эхэлсэн үед бот хасах боломжгүй.');
    const seat = Number(body.seat);
    if (!Number.isInteger(seat)) throw new GameError(400, 'Суудал буруу байна.');
    const { error } = await this.admin.from('game_room_players').delete().eq('room_code', roomCodeValue).eq('seat', seat).eq('is_bot', true);
    if (error) throw error;
    await this.touchRoom(roomCodeValue);
    return { ok: true };
  }

  /** Back to the lobby with the same players after a finished game. */
  async rematch(body: Body) {
    const roomCodeValue = code(body);
    const room = await this.room(roomCodeValue);
    if (room.host_id !== this.userId) throw new GameError(403, 'Зөвхөн өрөөний эзэн шинэ тоглолт эхлүүлнэ.');
    await Promise.all([
      this.admin.from('game_states').update({ engine: null, version: 0 }).eq('room_code', roomCodeValue),
      this.admin.from('game_public').delete().eq('room_code', roomCodeValue),
      this.admin.from('game_private').delete().eq('room_code', roomCodeValue),
      this.admin.from('game_room_players').update({ ready: false }).eq('room_code', roomCodeValue).neq('user_id', room.host_id).eq('is_bot', false),
      this.admin.from('voice_rooms').update({ game_phase: 'lobby', post_game_voice: false }).eq('room_code', roomCodeValue),
      this.admin.from('voice_room_members').update({ is_alive: true }).eq('room_code', roomCodeValue),
    ]);
    await this.touchRoom(roomCodeValue, { status: 'lobby' });
    return { ok: true };
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin, Deno.env.get('ALLOWED_ORIGINS') ?? '')) {
    return new Response(JSON.stringify({ error: 'Энэ домэйноос хүсэлт илгээх эрхгүй байна.' }), { status: 403, headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' } });
  }
  const headers = { ...baseCorsHeaders, ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Content-Type': 'application/json' };
  const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return respond(405, { error: 'Хүсэлтийн арга зөвшөөрөгдөөгүй.' });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return respond(401, { error: 'Тоглохын тулд нэвтэрнэ үү.' });
    const authClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(authorization.slice('Bearer '.length));
    if (authError || !user) return respond(401, { error: 'Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.' });

    const raw = await request.text();
    if (raw.length > 4096) return respond(413, { error: 'Хүсэлтийн хэмжээ хэтэрсэн байна.' });
    let body: Body;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
      body = parsed as Body;
    } catch {
      return respond(400, { error: 'Хүсэлтийн JSON буруу байна.' });
    }

    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const server = new GameServer(admin, user.id);
    const actions: Record<string, (body: Body) => Promise<Record<string, unknown>>> = {
      create: (value) => server.create(value),
      join: (value) => server.join(value),
      leave: (value) => server.leave(value),
      ready: (value) => server.ready(value),
      start: (value) => server.start(value),
      night: (value) => server.night(value),
      vote: (value) => server.vote(value),
      verdict: (value) => server.verdict(value),
      tick: (value) => server.tick(value),
      rematch: (value) => server.rematch(value),
      list: (value) => server.list(value),
      quick: (value) => server.quick(value),
      board: (value) => server.board(value),
      'bot-add': (value) => server.addBot(value),
      'bot-remove': (value) => server.removeBot(value),
    };
    const handler = typeof body.action === 'string' ? actions[body.action] : undefined;
    if (!handler) return respond(400, { error: 'Үйлдэл буруу байна.' });
    return respond(200, await handler(body));
  } catch (error) {
    if (error instanceof GameError) return respond(error.status, { error: error.message });
    console.error('game function failed', error);
    return respond(500, { error: 'Тоглоомын серверт алдаа гарлаа. Дахин оролдоно уу.' });
  }
});
