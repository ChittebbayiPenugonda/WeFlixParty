'use client';

import { useEffect, useRef } from 'react';

interface FaceCamProps {
  stream: MediaStream | null;
  label: string;
  position?: 'bottom-right' | 'bottom-left';
  isHost?: boolean;
}

export default function FaceCam({
  stream,
  label,
  position = 'bottom-right',
  isHost = false,
}: FaceCamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    // Always mute here — remote audio is handled by a dedicated <audio> element
    // in Room.tsx so browser autoplay restrictions don't block voice.
    video.muted = true;
    video.play().catch(() => undefined);
  }, [stream]);

  const posClass =
    position === 'bottom-right' ? 'bottom-20 right-4' : 'bottom-20 left-4';

  if (!stream) return null;

  return (
    <div
      className={`absolute ${posClass} w-36 h-24 md:w-48 md:h-32 rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl z-20`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-2 py-1 bg-black/50 text-white text-xs">
        {isHost && <span title="Host">👑</span>}
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}
