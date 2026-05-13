'use client';

import { useState, useCallback } from 'react';

interface ControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  movieVolume: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onToggleChat: () => void;
  onMovieVolumeChange: (v: number) => void;
  onLeave: () => void;
  onDuckStart: () => void;
  onDuckEnd: () => void;
  reactionBar: React.ReactNode;
}

export default function Controls({
  isMicOn,
  isCamOn,
  isScreenSharing,
  isChatOpen,
  movieVolume,
  onToggleMic,
  onToggleCam,
  onStartScreenShare,
  onStopScreenShare,
  onToggleChat,
  onMovieVolumeChange,
  onLeave,
  onDuckStart,
  onDuckEnd,
  reactionBar,
}: ControlsProps) {
  const [showVolume, setShowVolume] = useState(false);
  const [ducking, setDucking] = useState(false);

  const handleScreenShare = useCallback(() => {
    if (isScreenSharing) onStopScreenShare();
    else onStartScreenShare();
  }, [isScreenSharing, onStartScreenShare, onStopScreenShare]);

  const startDuck = useCallback(() => {
    setDucking(true);
    onDuckStart();
  }, [onDuckStart]);

  const endDuck = useCallback(() => {
    setDucking(false);
    onDuckEnd();
  }, [onDuckEnd]);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-2 pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent">
      {/* reaction bar */}
      <div className="flex items-center gap-2">{reactionBar}</div>

      {/* main controls row */}
      <div className="flex items-center gap-3">
        {/* mic */}
        <Btn
          onClick={onToggleMic}
          active={isMicOn}
          activeIcon="🎤"
          inactiveIcon="🔇"
          label={isMicOn ? 'Mute mic' : 'Unmute mic'}
          danger={!isMicOn}
        />

        {/* cam */}
        <Btn
          onClick={onToggleCam}
          active={isCamOn}
          activeIcon="📷"
          inactiveIcon="🚫"
          label={isCamOn ? 'Turn off camera' : 'Turn on camera'}
          danger={!isCamOn}
        />

        {/* screen share */}
        <button
          onClick={handleScreenShare}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            isScreenSharing ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <span>{isScreenSharing ? '🔴' : '🖥️'}</span>
          <span className="hidden sm:inline">
            {isScreenSharing ? 'Stop sharing' : 'Share screen'}
          </span>
        </button>

        {/* push-to-talk / duck movie — hold to talk clearly (also spacebar) */}
        <button
          onPointerDown={startDuck}
          onPointerUp={endDuck}
          onPointerLeave={endDuck}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium select-none transition-colors ${
            ducking
              ? 'bg-green-500 text-white scale-95'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title="Hold to talk clearly (ducks movie audio) — or hold Space"
        >
          <span>🔈</span>
          <span className="hidden sm:inline">{ducking ? 'Talking…' : 'Hold to talk'}</span>
        </button>

        {/* movie volume */}
        <div className="relative">
          <button
            onClick={() => setShowVolume((v) => !v)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Movie volume"
          >
            🎚️
          </button>
          {showVolume && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-zinc-800 rounded-xl px-3 py-4 shadow-xl flex flex-col items-center gap-2 w-10">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={movieVolume}
                onChange={(e) => onMovieVolumeChange(parseFloat(e.target.value))}
                className="h-24 cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' } as React.CSSProperties}
              />
              <span className="text-white/50 text-xs">{Math.round(movieVolume * 100)}%</span>
            </div>
          )}
        </div>

        {/* chat */}
        <button
          onClick={onToggleChat}
          className={`p-2 rounded-xl text-white transition-colors ${
            isChatOpen ? 'bg-indigo-500' : 'bg-white/10 hover:bg-white/20'
          }`}
          title="Chat"
        >
          💬
        </button>

        {/* leave */}
        <button
          onClick={onLeave}
          className="p-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-white transition-colors"
          title="Leave room"
        >
          📴
        </button>
      </div>

      {/* spacebar hint */}
      <p className="text-white/20 text-xs">Hold <kbd className="font-mono bg-white/10 px-1 rounded">Space</kbd> to talk clearly</p>
    </div>
  );
}

interface BtnProps {
  onClick: () => void;
  active: boolean;
  activeIcon: string;
  inactiveIcon: string;
  label: string;
  danger?: boolean;
}

function Btn({ onClick, active, activeIcon, inactiveIcon, label, danger }: BtnProps) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-xl text-white transition-colors ${
        danger ? 'bg-red-500/70 hover:bg-red-500' : 'bg-white/10 hover:bg-white/20'
      }`}
      title={label}
      aria-label={label}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}
