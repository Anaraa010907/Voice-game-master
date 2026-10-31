import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabaseClient';

/**
 * Facebook sign-in through the Facebook app installed on the phone (Android). The native
 * FacebookAuth plugin (android/app/src/main/java/.../FacebookAuthPlugin.java) returns a Facebook
 * access token; the facebook-login Edge Function checks it and opens a game session for it.
 */
type NativeResult = { accessToken?: string; userId?: string; cancelled?: boolean };
const FacebookAuth = registerPlugin<{ login(): Promise<NativeResult>; logout(): Promise<void> }>('FacebookAuth');

export const nativeFacebookAvailable = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FacebookAuth');

export type NativeFacebookOutcome =
  | { kind: 'signed-in' }
  | { kind: 'cancelled' }
  /** Show this message and stop (a banned account, no e-mail on Facebook…). */
  | { kind: 'error'; message: string }
  /** The native route is unavailable or failed: use the browser sign-in instead. */
  | { kind: 'fallback' };

export async function signInWithFacebookApp(): Promise<NativeFacebookOutcome> {
  if (!supabase || !nativeFacebookAvailable()) return { kind: 'fallback' };
  let result: NativeResult;
  try {
    result = await FacebookAuth.login();
  } catch (cause) {
    console.warn('Facebook app sign-in unavailable, using the browser.', cause);
    return { kind: 'fallback' };
  }
  if (result.cancelled) return { kind: 'cancelled' };
  if (!result.accessToken) return { kind: 'fallback' };

  const { data, error } = await supabase.functions.invoke('facebook-login', { body: { accessToken: result.accessToken } });
  if (error) {
    let payload: { error?: string; fallback?: boolean } | null = null;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') payload = await response.json().catch(() => null);
    // Not deployed yet, or a server-side hiccup: the browser route still works.
    if (!payload?.error || payload.fallback) return { kind: 'fallback' };
    return { kind: 'error', message: payload.error };
  }
  const tokens = data as { access_token?: string; refresh_token?: string } | null;
  if (!tokens?.access_token || !tokens.refresh_token) return { kind: 'fallback' };
  const { error: sessionError } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  return sessionError ? { kind: 'fallback' } : { kind: 'signed-in' };
}

/** Forget the Facebook login on this phone too, so the next sign-in may pick another account. */
export async function signOutOfFacebookApp() {
  if (!nativeFacebookAvailable()) return;
  try { await FacebookAuth.logout(); } catch { /* nothing to forget */ }
}
