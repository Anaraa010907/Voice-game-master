import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { supabase } from './supabaseClient';

import { t } from './lang';

/** After a game: the coins it paid (10 for taking part, 30 for a win, none for leaving early). */
export function MatchRewardBanner({ roomCode, userId }: { roomCode: string; userId: string }) {
  const [coins, setCoins] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let tries = 0;
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    const look = async () => {
      const { data } = await client.from('match_records').select('coins_earned,processed_at')
        .eq('user_id', userId).eq('room_code', roomCode).gte('processed_at', since).order('processed_at', { ascending: false }).limit(1);
      if (!active) return;
      const record = (data as Array<{ coins_earned: number }> | null)?.[0];
      if (record) { setCoins(record.coins_earned ?? 0); return; }
      // The server records the result a moment after the last move.
      tries += 1;
      if (tries < 6) window.setTimeout(() => { void look(); }, 1500);
    };
    void look();
    return () => { active = false; };
  }, [roomCode, userId]);
  if (coins === null || coins <= 0) return null;
  return <div className="match-reward" role="status"><span className="result-coins"><Coins size={13} />{t(`+${coins.toLocaleString('en-US')} зоос`, `+${coins.toLocaleString('en-US')} coins`)}</span></div>;
}
