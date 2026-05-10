'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Room from '@/components/Room';

function RoomLoader() {
  const params = useSearchParams();
  const roomId = params.get('id') ?? '';
  const isHost = params.get('host') === '1';

  if (!roomId) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        Invalid room link.
      </div>
    );
  }

  return <Room roomId={roomId} isHost={isHost} />;
}

export default function RoomPage() {
  return (
    <div className="h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-white/50 gap-3">
            <span className="animate-pulse text-3xl">🍿</span>
            <span>Loading room…</span>
          </div>
        }
      >
        <RoomLoader />
      </Suspense>
    </div>
  );
}
