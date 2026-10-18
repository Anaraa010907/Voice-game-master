import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient, TrackSource, TrackType } from 'npm:livekit-server-sdk@2';
import { voicePhaseAllowsSpeaking } from '../_shared/voicePolicy.ts';
import { isAllowedOrigin, parseVoiceRequest } from '../_shared/voiceRequest.ts';

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-room-controller-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const json = (status: number, body: Record<string, unknown>, headers = baseCorsHeaders) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin, Deno.env.get('ALLOWED_ORIGINS') ?? '')) {
    return json(403, { error: 'Энэ домэйноос хүсэлт илгээх эрхгүй байна.' });
  }
  const responseHeaders = {
    ...baseCorsHeaders,
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  const respond = (status: number, body: Record<string, unknown>) => json(status, body, responseHeaders);

  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Хүсэлтийн арга зөвшөөрөгдөөгүй.' });

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const livekitUrl = requiredEnv('LIVEKIT_URL');
    const livekitApiKey = requiredEnv('LIVEKIT_API_KEY');
    const livekitApiSecret = requiredEnv('LIVEKIT_API_SECRET');
    const parsedLivekitUrl = new URL(livekitUrl);
    if (parsedLivekitUrl.protocol !== 'wss:' || parsedLivekitUrl.username || parsedLivekitUrl.password
      || parsedLivekitUrl.pathname !== '/' || parsedLivekitUrl.search || parsedLivekitUrl.hash) {
      throw new Error('Invalid LiveKit server URL configuration');
    }
    const livekitHttpUrl = `https://${parsedLivekitUrl.host}`;
    const livekitServerUrl = `wss://${parsedLivekitUrl.host}`;
    const roomService = new RoomServiceClient(livekitHttpUrl, livekitApiKey, livekitApiSecret);
    const authorization = request.headers.get('Authorization');
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 8192) return respond(413, { error: 'Хүсэлтийн хэмжээ хэтэрсэн байна.' });
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return respond(400, { error: 'Хүсэлтийн JSON буруу байна.' });
    }
    const body = parseVoiceRequest(payload);
    if (!body) return respond(400, { error: 'Хүсэлтийн талбар буруу байна.' });
    const { roomCode } = body;

    if (body.action === 'sync') {
      const controllerSecret = requiredEnv('ROOM_CONTROLLER_SECRET');
      if (!controllerSecret || request.headers.get('x-room-controller-key') !== controllerSecret) {
        return respond(403, { error: 'Өрөөний удирдлагын эрх шаардлагатай.' });
      }
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { error: roomUpdateError } = await admin.from('voice_rooms').update({
        game_phase: body.phase,
        post_game_voice: body.phase === 'results' ? body.postGameVoice : false,
        updated_at: new Date().toISOString(),
      }).eq('room_code', roomCode);
      if (roomUpdateError) return respond(500, { error: 'Өрөөний дуу хоолойн эрхийг шинэчилж чадсангүй.' });
      const [{ data: voiceRoom, error: roomError }, { data: members, error: membersError }] = await Promise.all([
        admin.from('voice_rooms').select('game_phase,post_game_voice').eq('room_code', roomCode).maybeSingle(),
        admin.from('voice_room_members').select('user_id,is_alive,is_muted').eq('room_code', roomCode),
      ]);
      if (roomError || membersError) return respond(500, { error: 'Өрөөний оролцогчдын эрхийг шалгаж чадсангүй.' });
      if (!voiceRoom) return respond(404, { error: 'Дуу хоолойн өрөө олдсонгүй.' });

      const connected = await roomService.listParticipants(roomCode);
      for (const member of members ?? []) {
        const participant = connected.find((entry) => entry.identity === member.user_id);
        if (!participant) continue;
        const allowed = voicePhaseAllowsSpeaking(voiceRoom.game_phase, member.is_alive, member.is_muted, voiceRoom.post_game_voice);
        await roomService.updateParticipant(roomCode, participant.identity, {
          metadata: JSON.stringify({ mutedByHost: member.is_muted }),
          permission: {
            canPublish: allowed,
            canPublishSources: allowed ? [TrackSource.MICROPHONE] : [],
          },
        });
        if (!allowed) {
          for (const track of participant.tracks ?? []) {
            if (track.type === TrackType.AUDIO) await roomService.mutePublishedTrack(roomCode, participant.identity, track.sid, true);
          }
        }
      }
      return respond(200, { synchronized: true });
    }

    if (!authorization?.startsWith('Bearer ')) return respond(401, { error: 'Дуу хоолой ашиглахын тулд нэвтэрнэ үү.' });
    const accessToken = authorization.slice('Bearer '.length);
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return respond(401, { error: 'Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.' });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const [{ data: membership, error: membershipError }, { data: voiceRoom, error: roomError }] = await Promise.all([
      admin.from('voice_room_members').select('participant_name,is_alive,is_muted,is_host').eq('room_code', roomCode).eq('user_id', user.id).maybeSingle(),
      admin.from('voice_rooms').select('game_phase,post_game_voice').eq('room_code', roomCode).maybeSingle(),
    ]);
    if (membershipError || roomError) return respond(500, { error: 'Өрөөний гишүүнчлэлийг шалгаж чадсангүй.' });
    if (!membership || !voiceRoom) return respond(403, { error: 'Та энэ дуу хоолойн өрөөний гишүүн биш байна.' });

    if (body.action === 'leave') {
      const connected = await roomService.listParticipants(roomCode);
      if (connected.some((participant) => participant.identity === user.id)) await roomService.removeParticipant(roomCode, user.id);
      return respond(200, { left: true });
    }

    if (body.action === 'mute') {
      if (!membership.is_host) return respond(403, { error: 'Зөвхөн өрөөний эзэн бусад тоглогчийн микрофоныг удирдана.' });
      const { data: target, error: targetError } = await admin.from('voice_room_members')
        .select('user_id,is_alive,is_muted').eq('room_code', roomCode).eq('user_id', body.participantIdentity).maybeSingle();
      if (targetError) return respond(500, { error: 'Тоглогчийн эрхийг шалгаж чадсангүй.' });
      if (!target) return respond(404, { error: 'Өрөөний тоглогч олдсонгүй.' });
      const { error: updateError } = await admin.from('voice_room_members').update({ is_muted: body.muted })
        .eq('room_code', roomCode).eq('user_id', target.user_id);
      if (updateError) return respond(500, { error: 'Тоглогчийн микрофоны тохиргоог хадгалж чадсангүй.' });
      const allowed = voicePhaseAllowsSpeaking(voiceRoom.game_phase, target.is_alive, body.muted, voiceRoom.post_game_voice);
      const connected = await roomService.listParticipants(roomCode);
      const liveParticipant = connected.find((participant) => participant.identity === target.user_id);
      if (liveParticipant) {
        await roomService.updateParticipant(roomCode, liveParticipant.identity, {
          metadata: JSON.stringify({ mutedByHost: body.muted }),
          permission: {
            canPublish: allowed,
            canPublishSources: allowed ? [TrackSource.MICROPHONE] : [],
          },
        });
        if (body.muted) {
          for (const track of liveParticipant.tracks ?? []) {
            if (track.type === TrackType.AUDIO) await roomService.mutePublishedTrack(roomCode, liveParticipant.identity, track.sid, true);
          }
        }
      }
      return respond(200, { muted: body.muted, canPublish: allowed });
    }

    const allowed = voicePhaseAllowsSpeaking(voiceRoom.game_phase, membership.is_alive, membership.is_muted, voiceRoom.post_game_voice);
    if (body.action === 'permissions') return respond(200, { canPublish: allowed, muted: membership.is_muted });

    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: membership.participant_name,
      metadata: JSON.stringify({ mutedByHost: membership.is_muted }),
      ttl: '10m',
    });
    token.addGrant({
      roomJoin: true,
      room: roomCode,
      canPublish: allowed,
      canPublishSources: allowed ? [TrackSource.MICROPHONE] : [],
      canSubscribe: true,
      canPublishData: false,
    });
    return respond(200, { token: await token.toJwt(), serverUrl: livekitServerUrl, canPublish: allowed, muted: membership.is_muted });
  } catch {
    return respond(500, { error: 'Дуу хоолойн үйлчилгээнд алдаа гарлаа. Серверийн тохиргоог шалгана уу.' });
  }
});
