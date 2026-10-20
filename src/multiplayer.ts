import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { translateMessage } from './i18n';
import type { PrivateGameView, PublicGameView } from './gameEngine';

export type RoomInfo = { room_code: string; name: string; host_id: string; max_players: number; is_private: boolean; status: 'lobby' | 'playing' | 'finished' };
export type ListedRoom = { roomCode: string; name: string; players: number; maxPlayers: number; hostName: string; joined: boolean };
export type RoomSeat = { user_id: string; seat: number; display_name: string; color: string; ready: boolean };

/**
 * Calls an Edge Function on the same Supabase project the app signs in to, with the player's
 * session attached. Returns the data or throws the server's (translated) error message.
 */
export async function invokeFunction<T>(name: 'game' | 'livekit-voice', body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Сервер тохируулагдаагүй байна. .env.local файлыг шалгана уу.');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.';
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        const payload = await response.json() as { error?: string };
        if (payload.error) message = translateMessage(payload.error);
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  return data as T;
}

/** Calls the authoritative `game` Edge Function. */
export function callGame<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return invokeFunction<T>('game', { action, ...body });
}

/** Live room info and roster. Reloads on every realtime change to these rows. */
export function useRoom(roomCode: string | null) {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [seats, setSeats] = useState<RoomSeat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !roomCode) return;
    const [roomResult, seatResult] = await Promise.all([
      supabase.from('game_rooms').select('room_code,name,host_id,max_players,is_private,status').eq('room_code', roomCode).maybeSingle(),
      supabase.from('game_room_players').select('user_id,seat,display_name,color,ready').eq('room_code', roomCode).order('seat'),
    ]);
    setRoom((roomResult.data as RoomInfo | null) ?? null);
    setSeats((seatResult.data as RoomSeat[] | null) ?? []);
    setMissing(!roomResult.error && !roomResult.data);
    setLoaded(true);
  }, [roomCode]);

  useEffect(() => {
    if (!supabase || !roomCode) return;
    const client = supabase;
    void reload();
    const channel = client.channel(`room-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `room_code=eq.${roomCode}` }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_room_players', filter: `room_code=eq.${roomCode}` }, () => { void reload(); })
      .subscribe();
    // A slow safety refresh covers missed realtime events (sleeping phones, flaky networks).
    const interval = window.setInterval(() => { void reload(); }, 15000);
    return () => { window.clearInterval(interval); void client.removeChannel(channel); };
  }, [roomCode, reload]);

  return { room, seats, loaded, missing, reload };
}

/** Live public table view, this player's private view, and the phase deadline. */
export function useGame(roomCode: string | null, userId: string | null) {
  const [publicView, setPublicView] = useState<PublicGameView | null>(null);
  const [privateView, setPrivateView] = useState<PrivateGameView | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const versionRef = useRef(0);

  const reload = useCallback(async () => {
    if (!supabase || !roomCode || !userId) return;
    const [pub, priv] = await Promise.all([
      supabase.from('game_public').select('view,deadline,version').eq('room_code', roomCode).maybeSingle(),
      supabase.from('game_private').select('view,version').eq('room_code', roomCode).eq('user_id', userId).maybeSingle(),
    ]);
    if (pub.data) {
      versionRef.current = pub.data.version as number;
      setPublicView(pub.data.view as PublicGameView);
      setDeadline(pub.data.deadline ? Date.parse(pub.data.deadline as string) : null);
    } else {
      setPublicView(null);
    }
    setPrivateView((priv.data?.view as PrivateGameView | undefined) ?? null);
  }, [roomCode, userId]);

  useEffect(() => {
    if (!supabase || !roomCode || !userId) return;
    const client = supabase;
    void reload();
    const channel = client.channel(`game-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_public', filter: `room_code=eq.${roomCode}` }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_private', filter: `user_id=eq.${userId}` }, () => { void reload(); })
      .subscribe();
    const interval = window.setInterval(() => { void reload(); }, 10000);
    return () => { window.clearInterval(interval); void client.removeChannel(channel); };
  }, [roomCode, userId, reload]);

  return { publicView, privateView, deadline, reload };
}

/** Seconds left until the deadline, ticking every second. */
export function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
