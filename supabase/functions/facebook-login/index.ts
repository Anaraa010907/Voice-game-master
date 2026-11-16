/**
 * Native Facebook sign-in for the Android app.
 *
 * The app signs in through the Facebook app installed on the phone (Facebook Android SDK) and sends
 * the Facebook access token here. Supabase cannot take that token directly (it only accepts
 * Facebook's iOS Limited Login ID tokens), so this function:
 *   1. asks Facebook which app the token belongs to and refuses tokens of any other app;
 *   2. reads the player's Facebook ID, name, e-mail and picture with the same token;
 *   3. finds the account linked to that Facebook ID (the same one the browser sign-in created),
 *      or the account with the same e-mail, or creates a new one, and records the Facebook identity;
 *   4. opens a normal Supabase session for that account and returns its tokens.
 *
 * It does its own authentication (the Facebook token), so it is deployed with verify_jwt off.
 * FACEBOOK_APP_ID may override the built-in app ID; FACEBOOK_APP_SECRET, when set, adds an
 * appsecret_proof to every Graph request.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v23.0';
const DEFAULT_APP_ID = '1081195264747013';

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function allowedOrigin(origin: string | null) {
  if (origin === null) return true;
  if (origin === 'null') return false;
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean).includes(origin);
}

class LoginError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

async function appSecretProof(token: string) {
  const secret = Deno.env.get('FACEBOOK_APP_SECRET')?.trim();
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function graph<T>(path: string, token: string, fields?: string): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  if (fields) url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', token);
  const proof = await appSecretProof(token);
  if (proof) url.searchParams.set('appsecret_proof', proof);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok || body.error) throw new LoginError(401, 'Facebook нэвтрэлт хүчингүй байна. Дахин оролдоно уу.', { fallback: true });
  return body;
}

type FacebookUser = { id: string; name?: string; email?: string; picture?: { data?: { url?: string } } };

const BAN_MESSAGE = 'Энэ бүртгэл хаагдсан байна. Асуудлаа шийдүүлэхийг хүсвэл админтай холбогдоно уу.';

async function signIn(accessToken: string) {
  const appId = Deno.env.get('FACEBOOK_APP_ID')?.trim() || DEFAULT_APP_ID;
  // 1. The token must have been issued to this app, not to some other Facebook app.
  const app = await graph<{ id?: string }>('app', accessToken, 'id');
  if (app.id !== appId) throw new LoginError(401, 'Facebook нэвтрэлт өөр апп-д зориулагдсан байна.');

  // 2. Who the player is on Facebook.
  const me = await graph<FacebookUser>('me', accessToken, 'id,name,email,picture.width(256).height(256)');
  if (!me.id || !/^\d+$/.test(me.id)) throw new LoginError(401, 'Facebook бүртгэлийг уншиж чадсангүй.', { fallback: true });
  const facebookEmail = me.email?.trim().toLowerCase() || null;
  const picture = me.picture?.data?.url ?? null;
  const name = (me.name ?? '').trim();
  const identity = {
    iss: 'https://graph.facebook.com/me?fields=email,first_name,last_name,name,picture',
    sub: me.id, provider_id: me.id, name, full_name: name, email: facebookEmail, email_verified: Boolean(facebookEmail),
    phone_verified: false, picture, avatar_url: picture,
  };

  const url = env('SUPABASE_URL');
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

  // 3. The account: linked to this Facebook ID, else the same e-mail, else a new one.
  const { data: found, error: findError } = await admin.rpc('facebook_account', { p_facebook_id: me.id, p_email: facebookEmail });
  if (findError) throw findError;
  const existing = (found as Array<{ user_id: string; email: string | null; linked: boolean }> | null)?.[0] ?? null;
  let userId = existing?.user_id ?? null;
  let email = existing?.email ?? null;
  if (!userId) {
    if (!facebookEmail) {
      throw new LoginError(400, 'Таны Facebook бүртгэлд и-мэйл холбогдоогүй байна. И-мэйлээр бүртгүүлнэ үү.');
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: facebookEmail,
      email_confirm: true,
      user_metadata: { ...identity },
      app_metadata: { provider: 'facebook', providers: ['facebook'] },
    });
    if (createError || !created.user) throw createError ?? new Error('createUser');
    userId = created.user.id;
    email = facebookEmail;
  }
  const { error: linkError } = await admin.rpc('link_facebook_identity', { p_user: userId, p_facebook_id: me.id, p_data: identity });
  if (linkError) throw linkError;

  // 4. A normal session for that account: a one-time sign-in link, redeemed right here.
  if (!email) throw new LoginError(400, 'Энэ бүртгэлд и-мэйл алга тул Facebook-ийн хөтчөөр нэвтэрнэ үү.', { fallback: true });
  const { data: link, error: linkGenError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkGenError || !link?.properties?.hashed_token) {
    if (/banned/i.test(linkGenError?.message ?? '')) throw new LoginError(403, BAN_MESSAGE, { banned: true });
    throw linkGenError ?? new Error('generateLink');
  }
  const verifier = createClient(url, env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const type = link.properties.verification_type === 'signup' ? 'signup' : 'magiclink';
  const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({ token_hash: link.properties.hashed_token, type });
  if (verifyError || !verified.session) {
    if (/banned/i.test(verifyError?.message ?? '') || (verifyError as { code?: string } | null)?.code === 'user_banned') {
      throw new LoginError(403, BAN_MESSAGE, { banned: true });
    }
    throw verifyError ?? new Error('verifyOtp');
  }
  return { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token, created: !existing };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (!allowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Энэ домэйноос хүсэлт илгээх эрхгүй байна.' }), { status: 403, headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' } });
  }
  const headers = { ...baseCorsHeaders, ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Content-Type': 'application/json' };
  const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return respond(405, { error: 'Хүсэлтийн арга зөвшөөрөгдөөгүй.' });

  try {
    const raw = await request.text();
    if (raw.length > 8192) return respond(413, { error: 'Хүсэлтийн хэмжээ хэтэрсэн байна.' });
    let accessToken = '';
    try {
      const parsed = JSON.parse(raw) as { accessToken?: unknown };
      if (typeof parsed?.accessToken === 'string') accessToken = parsed.accessToken.trim();
    } catch { /* handled below */ }
    if (accessToken.length < 20 || accessToken.length > 4096 || /\s/.test(accessToken)) {
      return respond(400, { error: 'Facebook нэвтрэлтийн мэдээлэл буруу байна.' });
    }
    return respond(200, await signIn(accessToken));
  } catch (cause) {
    if (cause instanceof LoginError) return respond(cause.status, { error: cause.message, ...cause.extra });
    console.error('facebook-login failed', cause);
    return respond(500, { error: 'Facebook-ээр нэвтэрч чадсангүй. Дахин оролдоно уу.', fallback: true });
  }
});
