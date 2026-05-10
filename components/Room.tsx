'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom, roomExists } from '@/lib/signaling';
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
    initiateCall,
  } = useWebRTC({
    roomId,
    isHost,
    onPeerConnected: () => setStep('connected'),
    onPeerDisconnected: () => setStep('waiting'),
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
          // host waits for guest to arrive then fires offer via onnegotiationneeded
          setStep('waiting');
          await initiateCall();
        } else {
          setStep('waiting'); // guest waits for host's offer
        }
      } catch (err) {
        console.error('init failed', err);
        setStep('error');
      }
    }
    init();

    return () => {
      stopVAD();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── route remote screen stream audio through ducking ──────────────────────

  useEffect(() => {
    if (remoteScreenStream) {
      connectMovieAudio(remoteScreenStream);
    }
    return () => {
      if (remoteScreenStream) disconnectMovieAudio(remoteScreenStream);
    };
  }, [remoteScreenStream, connectMovieAudio, disconnectMovieAudio]);

  // ── attach remote screen stream to video element ──────────────────────────

  useEffect(() => {
    if (remoteScreenVideoRef.current && remoteScreenStream) {
      remoteScreenVideoRef.current.srcObject = remoteScreenStream;
    }
  }, [remoteScreenStream]);

  // ── movie volume slider ────────────────────────────────────────────────────

  const handleMovieVolume = useCallback(
    (v: number) => {
      setMovieVolume(v);
      setDuckGain(v);
    },
    [setMovieVolume, setDuckGain],
  );

  const handleLeave = useCallback(() => {
    router.push('/');
  }, [router]);

  // ── copy link ─────────────────────────────────────────────────────────────

  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const url = `${window.location.origin}${base}/room?id=${roomId}`;
    navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // ── render ─────────────────────────────────────────────────────────────────

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

  const showScreenShare = !!(remoteScreenStream || isScreenSharing);

  return (
    <div className="flex h-full">
      {/* ── main content ── */}
      <div className="relative flex-1 bg-black overflow-hidden">

        {/* ── main video area ── */}
        {remoteScreenStream ? (
          // Remote screen share — mute the video element; audio routes through ducking node
          <video
            ref={remoteScreenVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        ) : isScreenSharing ? (
          // We're sharing — show a local preview placeholder
          <div className="flex items-center justify-center w-full h-full text-white/40 flex-col gap-3">
            <div className="text-5xl">🖥️</div>
            <p className="text-sm">You are sharing your screen</p>
            <p className="text-xs text-white/30">Your peer sees your screen</p>
          </div>
        ) : (
          // No screen share — show local video player
          <div className="flex items-center justify-center w-full h-full">
            {/* VideoPlayer only shown when no active screen share */}
            <VideoPlayer
              roomId={roomId}
              onAudioStream={(s) => {
                if (s) connectMovieAudio(s);
              }}
            />
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

        {/* ── face cams ── */}
        <FaceCam
          stream={localStream}
          label="You"
          muted
          position={isHost ? 'bottom-right' : 'bottom-left'}
          isHost={isHost}
        />
        <FaceCam
          stream={remoteStream}
          label={peerLabel}
          muted={false}
          position={isHost ? 'bottom-left' : 'bottom-right'}
          isHost={!isHost}
        />

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
