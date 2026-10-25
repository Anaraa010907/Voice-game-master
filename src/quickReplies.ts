import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

/** Short ready-made lines for players without a microphone. Shown over the sender's avatar. */
export const QUICK_REPLIES = ['Би иргэн', 'Би биш!', 'Сэжигтэй', 'Санал нийлж байна', 'Үгүй', 'Түр хүлээ'] as const;
const SHOW_MS = 4500;
const COOLDOWN_MS = 1500;

type Bubble = { text: string; at: number };

/**
 * Quick replies travel over a Realtime broadcast channel for the room: nothing is stored.
 * Only phrases from the fixed list are shown, so a tampered client cannot post free text.
 */
export function useQuickReplies(roomCode: string, seat: number, enabled: boolean) {
  const [bubbles, setBubbles] = useState<Record<number, Bubble>>({});
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel(`quick-${roomCode}`, { config: { broadcast: { self: true } } });
    channel.on('broadcast', { event: 'reply' }, ({ payload }: { payload?: { seat?: unknown; text?: unknown } }) => {
      const from = Number(payload?.seat);
      const text = typeof payload?.text === 'string' ? payload.text : '';
      if (!Number.isInteger(from) || !(QUICK_REPLIES as readonly string[]).includes(text)) return;
      setBubbles((current) => ({ ...current, [from]: { text, at: Date.now() } }));
    }).subscribe();
    channelRef.current = channel;
    return () => { channelRef.current = null; void client.removeChannel(channel); };
  }, [roomCode]);

  // Drop bubbles once they have been on screen long enough.
  useEffect(() => {
    const id = window.setInterval(() => {
      setBubbles((current) => {
        const now = Date.now();
        const kept = Object.fromEntries(Object.entries(current).filter(([, bubble]) => now - bubble.at < SHOW_MS));
        return Object.keys(kept).length === Object.keys(current).length ? current : kept;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const send = useCallback((text: (typeof QUICK_REPLIES)[number]) => {
    if (!enabled || Date.now() - lastSent.current < COOLDOWN_MS) return;
    lastSent.current = Date.now();
    void channelRef.current?.send?.({ type: 'broadcast', event: 'reply', payload: { seat, text } });
  }, [enabled, seat]);

  return { bubbles, send };
}
