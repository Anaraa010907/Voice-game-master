import { supabaseConfigured } from './supabaseClient';

/*
 * Which server-free Who Am I preview the URL asks for (see WhoAmIDemo.tsx).
 *
 * DEMO_ENABLED is decided at build time from values Vite inlines, so in a build with Supabase keys
 * (the live web app and the Android APK) it is the constant `false`: the demo can never open and the
 * lazily imported WhoAmIDemo chunk is dropped from the bundle.
 */

export type DemoPhase = 'reveal' | 'ask' | 'answer' | 'guess' | 'results';
export type DemoRequest = { screen: 'hub' | 'create' | 'lobby' | 'game'; phase: DemoPhase; seat: number | null; auto: boolean; bar: boolean; players: number };
export const DEMO_PHASES: DemoPhase[] = ['reveal', 'ask', 'answer', 'guess', 'results'];
/** Seats 1..players exist in the demo table: 6 by default, `&players=3..10` for other table sizes. */
export const DEMO_SEAT_COUNT = 6;
export const DEMO_MAX_SEATS = 10;

export const DEMO_ENABLED = import.meta.env.DEV || !(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export function demoRequest(): DemoRequest | null {
  if (!DEMO_ENABLED || typeof window === 'undefined') return null;
  if (!import.meta.env.DEV && supabaseConfigured) return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get('demo');
  if (!value) return null;
  const screen = value === 'hub' || value === 'create' || value === 'lobby' ? value : 'game';
  const phase = DEMO_PHASES.includes(params.get('phase') as DemoPhase) ? params.get('phase') as DemoPhase : 'ask';
  const count = Number(params.get('players'));
  const players = Number.isInteger(count) && count >= 3 && count <= DEMO_MAX_SEATS ? count : DEMO_SEAT_COUNT;
  const seat = Number(params.get('seat'));
  return { screen, phase, seat: Number.isInteger(seat) && seat >= 1 && seat <= players ? seat : null, auto: params.get('auto') === '1', bar: params.get('bar') !== '0', players };
}
