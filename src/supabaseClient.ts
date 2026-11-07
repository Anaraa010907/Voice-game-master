import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export type PublicProfile = {
  id: string;
  display_name: string;
  avatar_key: string;
  avatar_url?: string | null;
  registration_method: 'email' | 'phone';
  created_at: string;
  is_verified: boolean;
  player_level: number;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  current_win_streak: number;
  best_win_streak: number;
};
