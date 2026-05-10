'use client';

import { useRef, useCallback, useEffect } from 'react';
import { writeSync, onSync, type SyncPayload } from '@/lib/signaling';

interface UseSyncOptions {
  roomId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function useSync({ roomId, videoRef }: UseSyncOptions) {
  const suppressRef = useRef(false); // prevent echo when we apply a remote sync

  const emit = useCallback(
    (event: SyncPayload['event'], currentTime: number) => {
      writeSync(roomId, { event, currentTime, ts: Date.now() }).catch(console.error);
    },
    [roomId],
  );

  const onPlay = useCallback(() => {
    if (suppressRef.current) return;
    emit('play', videoRef.current?.currentTime ?? 0);
  }, [emit, videoRef]);

  const onPause = useCallback(() => {
    if (suppressRef.current) return;
    emit('pause', videoRef.current?.currentTime ?? 0);
  }, [emit, videoRef]);

  const onSeeked = useCallback(() => {
    if (suppressRef.current) return;
    emit('seek', videoRef.current?.currentTime ?? 0);
  }, [emit, videoRef]);

  useEffect(() => {
    if (!roomId) return;

    const unsub = onSync(roomId, ({ event, currentTime, ts }) => {
      const video = videoRef.current;
      if (!video) return;

      // ignore stale events (older than 3 s)
      if (Date.now() - ts > 3000) return;

      suppressRef.current = true;
      video.currentTime = currentTime;

      if (event === 'play') video.play().catch(() => undefined);
      if (event === 'pause') video.pause();
      if (event === 'seek') { /* currentTime already set */ }

      setTimeout(() => {
        suppressRef.current = false;
      }, 300);
    });

    return unsub;
  }, [roomId, videoRef]);

  return { onPlay, onPause, onSeeked };
}
