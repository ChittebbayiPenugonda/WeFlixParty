'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom, roomExists, signalGuestJoined } from '@/lib/signaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAudioDucking } from '@/hooks/useAudioDucking';
import FaceCam from './FaceCam';
import ReactionBar from './ReactionBar';
import VideoPlayer from './VideoPlayer';
import Controls from './Controls';
import ChatSidebar from './ChatSidebar';

interface RoomProps {
  roomId: string;
  isHost: boolean;
}

type SetupStep = 'loading' | 'waiting' | 'connected' | 'error';

export default function Room({ roomId, isHost }: RoomProps) {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('loading');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [movieVolume, setMovieVolume] = useState(1);
  const [peerLabel] = useState(isHost ? 'Guest' : 'Host');
  const remoteScreenVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenVideoRef = useRef<HTMLVideoElement>(null);
  // Dedicated <audio> element for remote webcam voice — more reliable autoplay than
  // playing audio through the <video> element in FaceCam.
  const remoteVoiceAudioRef = useRef<HTMLAudioElement>(null);
  const role: 'host' | 'guest' = isHost ? 'host' : 'guest';

  const {
    connectMovieAudio,
    disconnectMovieAudio,
    startVAD,
    stopVAD,
    setMovieVolume: setDuckGain,
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

  // ── boot sequence ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        if (isHost) {
          await createRoom(roomId);
        } else {
          const exists = await roomExists(roomId);
          if (!exists) {
            setStep('error');
            return;
          }
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

  // ── remote voice audio — dedicated <audio> element bypasses FaceCam ──────

  useEffect(() => {
    const audio = remoteVoiceAudioRef.current;
    if (!audio || !remoteStream) return;
    audio.srcObject = remoteStream;
    audio.play().catch((e) => console.warn('[Room] remote voice play blocked:', e));
  }, [remoteStream]);

  // ── remote screen share: audio through ducking, video through <video> ─────

  useEffect(() => {
    if (remoteScreenStream) connectMovieAudio(remoteScreenStream);
    return () => { if (remoteScreenStream) disconnectMovieAudio(remoteScreenStream); };
  }, [remoteScreenStream, connectMovieAudio, disconnectMovieAudio]);

  useEffect(() => {
    const v = remoteScreenVideoRef.current;
    if (v && remoteScreenStream) {
      v.srcObject = remoteScreenStream;
      v.play().catch(() => undefined);
    }
  }, [remoteScreenStream]);

  // ── local screen share preview ────────────────────────────────────────────

  useEffect(() => {
    const v = localScreenVideoRef.current;
    if (v && localScreenStream) {
      v.srcObject = localScreenStream;
      v.play().catch(() => undefined);
    }
  }, [localScreenStream]);

  // ── movie volume slider ───────────────────────────────────────────────────

  const handleMovieVolume = useCallback(
    (v: number) => {
      setMovieVolume(v);
      setDuckGain(v);
    },
    [setDuckGain],
  );

  const handleLeave = useCallback(() => router.push('/'), [router]);

  // ── copy link ─────────────────────────────────────────────────────────────

  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const url = `${window.location.origin}${base}/room?id=${roomId}`;
    navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // ── render ────────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <div className="flex items-center justify-center h-full text-white flex-col gap-4">
        <p className="text-2xl">Room not found</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── main content ── */}
      <div className="relative flex-1 bg-black overflow-hidden">

        {/* ── main video area ── */}
        {remoteScreenStream ? (
          // Remote peer is sharing — show their screen (audio routed through AudioContext)
          <video
            ref={remoteScreenVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        ) : localScreenStream ? (
          // We are sharing — show our own screen as a preview
          <video
            ref={localScreenVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        ) : (
          // No screen share active — local video file player
          <div className="flex items-center justify-center w-full h-full">
            <VideoPlayer
              roomId={roomId}
              onAudioStream={(s) => { if (s) connectMovieAudio(s); }}
            />
          </div>
        )}

        {/* Sharing indicator badge */}
        {localScreenStream && !remoteScreenStream && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-indigo-600/80 text-white text-xs px-3 py-1 rounded-full z-10">
            🖥️ You are sharing — your friend sees this
          </div>
        )}

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

        {/* ── face cams — video only, audio handled by <audio> below ── */}
        <FaceCam
          stream={localStream}
          label="You"
          position={isHost ? 'bottom-right' : 'bottom-left'}
          isHost={isHost}
        />
        <FaceCam
          stream={remoteStream}
          label={peerLabel}
          position={isHost ? 'bottom-left' : 'bottom-right'}
          isHost={!isHost}
        />

        {/* Dedicated audio element for remote voice — avoids autoplay restrictions
            that affect <video> elements with audio. Always unmuted. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={remoteVoiceAudioRef} autoPlay playsInline className="hidden" />

        {/* ── controls bar ── */}
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
          onLeave={handleLeave}
          reactionBar={<ReactionBar roomId={roomId} role={role} />}
        />

        {/* ── room id badge ── */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1 text-white/50 text-xs z-10">
          <span className={`w-2 h-2 rounded-full ${step === 'connected' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
          <span>{step === 'connected' ? 'Connected' : 'Waiting…'}</span>
          <span className="text-white/20 font-mono">{roomId}</span>
          <button
            onClick={copyLink}
            className="text-white/40 hover:text-white ml-1 transition-colors"
            title="Copy invite link"
          >
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
        />
      )}
    </div>
  );
}
