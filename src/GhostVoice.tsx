import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room as LiveKitRoom } from 'livekit-client';
import { Ghost, Headphones, LoaderCircle, Mic, MicOff } from 'lucide-react';
import { supabase, supabaseConfigured } from './supabaseClient';
import { invokeFunction } from './multiplayer';
import { i18n } from './i18n';

const tokenUrl = supabaseConfigured;

type GhostState = 'idle' | 'connecting' | 'connected';
type GhostMember = { identity: string; name: string; speaking: boolean };

/**
 * Voice room for eliminated players. It is a separate LiveKit room that the server only lets
 * eliminated players into, so the living can never hear it. Ghosts still hear the main table
 * through the normal voice dock.
 */
export default function GhostVoice({ roomCode, userId }: { roomCode: string; userId: string }) {
  const roomRef = useRef<LiveKitRoom | null>(null);
  const audio = useRef(new Set<HTMLMediaElement>());
  const [state, setState] = useState<GhostState>('idle');
  const [micOn, setMicOn] = useState(false);
  const [members, setMembers] = useState<GhostMember[]>([]);
  const [error, setError] = useState('');

  const request = useCallback(async (action: 'token' | 'leave') => {
    if (!tokenUrl || !supabase) throw new Error(i18n.voice.unavailable);
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken || data.session?.user.id !== userId) throw new Error(i18n.voice.signInRequired);
    return invokeFunction<{ token?: string; serverUrl?: string; canPublish?: boolean }>('livekit-voice', { action, roomCode, channel: 'ghost' });
  }, [roomCode, userId]);

  const refresh = useCallback((room: LiveKitRoom) => {
    const speaking = new Set(room.activeSpeakers.map((participant) => participant.identity));
    setMembers([room.localParticipant, ...room.remoteParticipants.values()].map((participant) => ({
      identity: participant.identity,
      name: participant.name || '?',
      speaking: speaking.has(participant.identity),
    })));
  }, []);

  const cleanup = useCallback(() => {
    for (const element of audio.current) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    audio.current.clear();
    roomRef.current = null;
    setState('idle');
    setMicOn(false);
    setMembers([]);
  }, []);

  const join = useCallback(async () => {
    if (roomRef.current) return roomRef.current;
    setError('');
    setState('connecting');
    try {
      const credentials = await request('token');
      if (!credentials.token || !credentials.serverUrl) throw new Error(i18n.voice.connectionError);
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room({ adaptiveStream: true, dynacast: false });
      roomRef.current = room;
      room
        .on(RoomEvent.Disconnected, cleanup)
        .on(RoomEvent.ParticipantConnected, () => refresh(room))
        .on(RoomEvent.ParticipantDisconnected, () => refresh(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => refresh(room))
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const element = track.attach();
          element.autoplay = true;
          element.setAttribute('playsinline', '');
          document.body.appendChild(element);
          audio.current.add(element);
          void element.play().catch(() => setError(i18n.voice.audioPlaybackError));
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          for (const element of track.detach()) {
            audio.current.delete(element);
            element.remove();
          }
        });
      await room.connect(credentials.serverUrl, credentials.token);
      setState('connected');
      refresh(room);
      return room;
    } catch (cause) {
      const room = roomRef.current;
      if (room) await room.disconnect(true);
      cleanup();
      setError(cause instanceof Error ? cause.message : i18n.voice.connectionError);
      return null;
    }
  }, [cleanup, refresh, request]);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (room) await room.disconnect(true);
    cleanup();
    void request('leave').catch(() => undefined);
  }, [cleanup, request]);

  const toggleMic = useCallback(async () => {
    setError('');
    const room = roomRef.current ?? await join();
    if (!room) return;
    try {
      const next = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(room.localParticipant.isMicrophoneEnabled);
      refresh(room);
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      setError(denied ? i18n.voice.permissionDenied : i18n.voice.deviceError);
    }
  }, [join, refresh]);

  // Leave the ghost room when this panel goes away (game over, rematch, leaving the table).
  useEffect(() => () => {
    const room = roomRef.current;
    if (room) void room.disconnect(true);
    for (const element of audio.current) element.remove();
    audio.current.clear();
  }, []);

  return <section className="ghost-voice" aria-label="Үхэгсдийн суваг">
    <header><Ghost size={15} /><b>ҮХЭГСДИЙН СУВАГ</b><small>Амьд тоглогчид сонсохгүй</small></header>
    {state === 'connected'
      ? <div className="ghost-members">{members.map((member) => <span key={member.identity} className={member.speaking ? 'is-speaking' : ''}>{member.name}{member.identity === userId ? ' (чи)' : ''}</span>)}</div>
      : <p>Хасагдсан тоглогчид энд хоорондоо ярьж, тоглолтыг хамт ажиглана.</p>}
    <div className="ghost-actions">
      {state === 'connected'
        ? <><button type="button" className={`secondary-button ${micOn ? 'is-ready' : ''}`} onClick={() => void toggleMic()}>{micOn ? <Mic size={14} /> : <MicOff size={14} />}{micOn ? 'МИКРОФОН АСААЛТТАЙ' : 'МИКРОФОН АСААХ'}</button><button type="button" className="text-button" onClick={() => void leave()}>ГАРАХ</button></>
        : <button type="button" className="primary-button" disabled={state === 'connecting' || !tokenUrl} onClick={() => void join()}>{state === 'connecting' ? <LoaderCircle size={14} className="voice-spinner" /> : <Headphones size={14} />}{state === 'connecting' ? 'ХОЛБОГДОЖ БАЙНА…' : 'СУВАГТ НЭГДЭХ'}</button>}
    </div>
    {error && <p className="voice-error">{error}</p>}
  </section>;
}
