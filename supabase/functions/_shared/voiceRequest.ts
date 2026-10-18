import type { VoicePhase } from './voicePolicy.ts';

export type VoiceAction = 'token' | 'permissions' | 'mute' | 'leave' | 'sync';

export type VoiceRequest =
  | { action: 'token' | 'permissions' | 'leave'; roomCode: string }
  | { action: 'mute'; roomCode: string; participantIdentity: string; muted: boolean }
  | { action: 'sync'; roomCode: string; phase: VoicePhase; postGameVoice?: boolean };

const voicePhases: VoicePhase[] = ['lobby', 'role-reveal', 'night', 'morning', 'discussion', 'voting', 'results'];
const roomCodePattern = /^[A-Z0-9-]{4,32}$/;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const voiceActions: VoiceAction[] = ['token', 'permissions', 'mute', 'leave', 'sync'];
const fieldsByAction: Record<VoiceAction, ReadonlySet<string>> = {
  token: new Set(['action', 'roomCode']),
  permissions: new Set(['action', 'roomCode']),
  leave: new Set(['action', 'roomCode']),
  mute: new Set(['action', 'roomCode', 'participantIdentity', 'muted']),
  sync: new Set(['action', 'roomCode', 'phase', 'postGameVoice']),
};

function isVoicePhase(value: unknown): value is VoicePhase {
  return typeof value === 'string' && voicePhases.includes(value as VoicePhase);
}

export function parseVoiceRequest(value: unknown): VoiceRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const action = voiceActions.find((candidate) => candidate === body.action);
  if (!action) return null;
  if (!Object.keys(body).every((key) => fieldsByAction[action].has(key))) return null;
  if (typeof body.roomCode !== 'string') return null;
  const roomCode = body.roomCode.trim().toUpperCase();
  if (!roomCodePattern.test(roomCode)) return null;

  if (action === 'mute') {
    const participantIdentity = body.participantIdentity;
    const muted = body.muted;
    if (typeof participantIdentity !== 'string' || !userIdPattern.test(participantIdentity)
      || typeof muted !== 'boolean') return null;
    return { action, roomCode, participantIdentity, muted };
  }

  if (action === 'sync') {
    const phase = body.phase;
    const postGameVoice = body.postGameVoice;
    if (!isVoicePhase(phase)
      || (phase === 'results' && typeof postGameVoice !== 'boolean')
      || (postGameVoice !== undefined && typeof postGameVoice !== 'boolean')) return null;
    return postGameVoice === undefined
      ? { action, roomCode, phase }
      : { action, roomCode, phase, postGameVoice };
  }

  return { action, roomCode };
}

export function isAllowedOrigin(origin: string | null, configuredOrigins: string): boolean {
  if (origin === null) return true;
  if (origin === 'null') return false;
  return configuredOrigins.split(',').map((value) => value.trim()).filter(Boolean).includes(origin);
}
