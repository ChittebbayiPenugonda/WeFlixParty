'use client';

import { useRef, useState, useCallback } from 'react';
import { useSync } from '@/hooks/useSync';

interface VideoPlayerProps {
  roomId: string;
  /** Called whenever the video's audio stream changes (so ducking can connect) */
  onAudioStream?: (stream: MediaStream | null) => void;
}

export default function VideoPlayer({ roomId, onAudioStream }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const { onPlay, onPause, onSeeked } = useSync({ roomId, videoRef });

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (src) URL.revokeObjectURL(src);
      const url = URL.createObjectURL(file);
      setSrc(url);
      setFileName(file.name);

      // capture the video's audio stream for ducking
      if (videoRef.current && onAudioStream) {
        const el = videoRef.current as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        const stream =
          el.captureStream?.() ?? el.mozCaptureStream?.() ?? null;
        onAudioStream(stream);
      }
    },
    [src, onAudioStream],
  );

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-white/50 select-none">
        <div className="text-6xl">🎬</div>
        <p className="text-sm">No screen share active — open a local video file</p>
        <label className="cursor-pointer px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">
          Open video file
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
        <p className="text-xs text-white/30">
          Both people need their own copy of the file
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        src={src}
        controls
        className="w-full h-full"
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
      />
      <div className="absolute top-2 left-2 text-xs text-white/40 bg-black/40 px-2 py-0.5 rounded">
        {fileName}
      </div>
      <label className="absolute top-2 right-2 cursor-pointer text-xs text-white/40 bg-black/40 hover:bg-black/70 px-2 py-0.5 rounded transition-colors">
        Change file
        <input
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={handleFile}
        />
      </label>
    </div>
  );
}
