'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom, roomExists, signalGuestJoined, setPresence, pruneRoomIfEmpty } from '@/lib/signaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAudioDucking } from '@/hooks/useAudioDucking';
import FaceCam from './FaceCam';
import DraggableVideo from './DraggableVideo';
import ReactionBar from './ReactionBar';
import VideoPlayer from './VideoPlayer';
import Controls from './Controls';
import ChatSidebar from './ChatSidebar';

interface RoomProps {
  roomId: string;
  isHost: boolean;
}

type SetupStep = 'loading' | 'waiting' | 'connected' | 'error';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function Room({ roomId, isHost }: RoomProps) {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('loading');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [movieVolume, setMovieVolume] = useState(1);
  const [customReactions, setCustomReactions] = useState(false);
  const [peerLabel] = useState(isHost ? 'Guest' : 'Host');
  const remoteVoiceAudioRef = useRef<HTMLAudioElement>(null);
  const role: 'host' | 'guest' = isHost ? 'host' : 'guest';

  const {
    connectMovieAudio,
    disconnectMovieAudio,
    startVAD,
    stopVAD,
    setMovieVolume: setDuckGain,
    pushToTalkStart,
    pushToTalkEnd,
  } = useAudioDucking();

  const {
    localStream,
    localScreenStream,
    remoteStream,
    remoteScreenStream,
    isScreenSharing,
    isMicOn,
    isCamOn,
    startWebcam,
    startScreenShare,
    stopScreenShare,
    toggleMic,
    toggleCam,
  } = useWebRTC({
    roomId,
    isHost,
    onPeerConnected: useCallback(() => setStep('connected'), []),
    onPeerDisconnected: useCallback(() => setStep('waiting'), []),
  });

  // ── presence cleanup — runs when component unmounts or tab closes ──────────

  useEffect(() => {
    const cleanup = () => {
      // Mark this peer offline then prune the room if both are gone.
      // Fire-and-forget — we can't reliably await on tab close.
      setPresence(roomId, role, false)
        .then(() => pruneRoomIfEmpty(roomId))
        .catch(console.error);
    };

    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, role]);

  // ── boot sequence ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        if (isHost) {
          await createRoom(roomId); // sets hostOnline: true inside createRoom
        } else {
          const exists = await roomExists(roomId);
          if (!exists) { setStep('error'); return; }
          await setPresence(roomId, 'guest', true);
        }
        const stream = await startWebcam();
        if (stream) startVAD(stream);
        if (isHost) {
          setStep('waiting');
        } else {
          await signalGuestJoined(roomId);
          setStep('waiting');
        }
      } catch (err) {
        console.error('init failed', err);
        setStep('error');
      }
    }
    init();
    return () => stopVAD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── remote voice audio ────────────────────────────────────────────────────

  useEffect(() => {
    const audio = remoteVoiceAudioRef.current;
    if (!audio || !remoteStream) return;
    audio.srcObject = remoteStream;
    audio.play().catch((e) => console.warn('[Room] remote voice play blocked:', e));
  }, [remoteStream]);

  // ── remote screen share audio → ducking node ──────────────────────────────

  useEffect(() => {
    if (remoteScreenStream) connectMovieAudio(remoteScreenStream);
    return () => { if (remoteScreenStream) disconnectMovieAudio(remoteScreenStream); };
  }, [remoteScreenStream, connectMovieAudio, disconnectMovieAudio]);

  // ── movie volume ──────────────────────────────────────────────────────────

  const handleMovieVolume = useCallback(
    (v: number) => { setMovieVolume(v); setDuckGain(v); },
    [setDuckGain],
  );

  // ── spacebar push-to-talk (skip when typing in chat input) ───────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      pushToTalkStart();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      pushToTalkEnd();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pushToTalkStart, pushToTalkEnd]);

  const handleLeave = useCallback(() => router.push('/'), [router]);

  // ── chat command handler ──────────────────────────────────────────────────

  const handleCommand = useCallback((cmd: string) => {
    if (cmd === 'react_mr') setCustomReactions((v) => !v);
  }, []);

  // ── copy link ─────────────────────────────────────────────────────────────

  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    const url = `${window.location.origin}${BASE_PATH}/room?id=${roomId}`;
    navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // ── render ────────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <div className="flex items-center justify-center h-full text-white flex-col gap-4">
        <p className="text-2xl">Room not found</p>
        <button onClick={() => router.push('/')} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm">
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="relative flex-1 bg-zinc-950 overflow-hidden">

        {/* ── background: video file player (always visible behind floating windows) ── */}
        <div className="absolute inset-0 flex items-center justify-center">
          <VideoPlayer
            roomId={roomId}
            onAudioStream={(s) => { if (s) connectMovieAudio(s); }}
          />
        </div>

        {/* ── waiting overlay ── */}
        {step === 'waiting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 z-40">
            <div className="text-5xl animate-pulse">🍿</div>
            <p className="text-white text-lg font-medium">
              {isHost ? 'Waiting for your friend…' : 'Connecting…'}
            </p>
            {isHost && (
              <button
                onClick={copyLink}
                className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors"
              >
                {copied ? '✅ Copied!' : '🔗 Copy invite link'}
              </button>
            )}
          </div>
        )}

        {/* ── draggable screen share windows ── */}
        {localScreenStream && (
          <DraggableVideo
            stream={localScreenStream}
            label="Your screen"
            muted
            defaultW={520}
            defaultH={320}
            onStop={stopScreenShare}
          />
        )}
        {remoteScreenStream && (
          <DraggableVideo
            stream={remoteScreenStream}
            label={`${peerLabel}'s screen`}
            muted          // audio routed through AudioContext ducking node
            defaultW={520}
            defaultH={320}
            initialPos={{ x: 40, y: 40 }}
          />
        )}

        {/* ── face cams — draggable, local cam mirrored ── */}
        <FaceCam
          stream={localStream}
          label="You"
          mirrored
          position={isHost ? 'bottom-right' : 'bottom-left'}
          isHost={isHost}
        />
        <FaceCam
          stream={remoteStream}
          label={peerLabel}
          position={isHost ? 'bottom-left' : 'bottom-right'}
          isHost={!isHost}
        />

        {/* dedicated <audio> for remote voice */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={remoteVoiceAudioRef} autoPlay playsInline className="hidden" />

        {/* ── controls ── */}
        <Controls
          isMicOn={isMicOn}
          isCamOn={isCamOn}
          isScreenSharing={isScreenSharing}
          isChatOpen={isChatOpen}
          movieVolume={movieVolume}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onStartScreenShare={startScreenShare}
          onStopScreenShare={stopScreenShare}
          onToggleChat={() => setIsChatOpen((o) => !o)}
          onMovieVolumeChange={handleMovieVolume}
          onDuckStart={pushToTalkStart}
          onDuckEnd={pushToTalkEnd}
          onLeave={handleLeave}
          reactionBar={
            <ReactionBar
              roomId={roomId}
              role={role}
              customMode={customReactions}
              basePath={BASE_PATH}
            />
          }
        />

        {/* ── room badge ── */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1 text-white/50 text-xs z-10">
          <span className={`w-2 h-2 rounded-full ${step === 'connected' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
          <span>{step === 'connected' ? 'Connected' : 'Waiting…'}</span>
          <span className="text-white/20 font-mono">{roomId}</span>
          <button onClick={copyLink} className="text-white/40 hover:text-white ml-1 transition-colors" title="Copy invite link">
            {copied ? '✅' : '🔗'}
          </button>
        </div>
      </div>

      {/* ── chat sidebar ── */}
      {isChatOpen && (
        <ChatSidebar
          roomId={roomId}
          role={role}
          onClose={() => setIsChatOpen(false)}
          onCommand={handleCommand}
        />
      )}
    </div>
  );
}
