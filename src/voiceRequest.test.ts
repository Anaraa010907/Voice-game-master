import assert from 'node:assert/strict';
import { isAllowedOrigin, parseVoiceRequest } from '../supabase/functions/_shared/voiceRequest.ts';

const userId = '11111111-1111-4111-8111-111111111111';

assert.deepEqual(parseVoiceRequest({ action: 'token', roomCode: ' night-7x ' }), {
  action: 'token',
  roomCode: 'NIGHT-7X',
});
assert.equal(parseVoiceRequest({ action: 'token', roomCode: 'NIGHT-7X', participantIdentity: userId }), null);
assert.equal(parseVoiceRequest({ action: 'token', roomCode: 'bad' }), null);
assert.equal(parseVoiceRequest({ action: 'mute', roomCode: 'NIGHT-7X', participantIdentity: userId, muted: false })?.action, 'mute');
assert.equal(parseVoiceRequest({ action: 'mute', roomCode: 'NIGHT-7X', participantIdentity: 'not-a-user', muted: true }), null);
assert.equal(parseVoiceRequest({ action: 'mute', roomCode: 'NIGHT-7X', participantIdentity: userId, muted: 'true' }), null);
assert.equal(parseVoiceRequest({ action: 'sync', roomCode: 'NIGHT-7X', phase: 'results' }), null);
assert.equal(parseVoiceRequest({ action: 'sync', roomCode: 'NIGHT-7X', phase: 'discussion', postGameVoice: false })?.action, 'sync');
assert.equal(parseVoiceRequest({ action: 'sync', roomCode: 'NIGHT-7X', phase: 'private-role' }), null);
assert.deepEqual(parseVoiceRequest({ action: 'token', roomCode: 'NIGHT-7X', channel: 'ghost' }), { action: 'token', roomCode: 'NIGHT-7X', channel: 'ghost' });
assert.deepEqual(parseVoiceRequest({ action: 'leave', roomCode: 'NIGHT-7X', channel: 'ghost' }), { action: 'leave', roomCode: 'NIGHT-7X', channel: 'ghost' });
assert.deepEqual(parseVoiceRequest({ action: 'token', roomCode: 'NIGHT-7X', channel: 'main' }), { action: 'token', roomCode: 'NIGHT-7X' });
assert.equal(parseVoiceRequest({ action: 'token', roomCode: 'NIGHT-7X', channel: 'spectators' }), null);
assert.equal(parseVoiceRequest({ action: 'permissions', roomCode: 'NIGHT-7X', channel: 'ghost' }), null);
assert.deepEqual(parseVoiceRequest({ action: 'token', roomCode: 'NIGHT-7X', channel: 'mafia' }), { action: 'token', roomCode: 'NIGHT-7X', channel: 'mafia' });
assert.equal(parseVoiceRequest({ action: 'token', roomCode: 'NIGHT-7X', channel: 'secret' }), null);
assert.equal(parseVoiceRequest(null), null);
assert.equal(isAllowedOrigin(null, ''), true);
assert.equal(isAllowedOrigin('https://game.example', 'https://game.example, capacitor://localhost'), true);
assert.equal(isAllowedOrigin('https://attacker.example', 'https://game.example'), false);
assert.equal(isAllowedOrigin('null', 'null'), false);

console.log('voice request validation checks passed');
