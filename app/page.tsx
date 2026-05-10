'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  function createRoom() {
    const id = uuidv4().slice(0, 8);
    router.push(`/room?id=${id}&host=1`);
  }

  function joinRoom() {
    const id = joinCode.trim();
    if (!id) {
      setError('Enter a room code or paste the invite link');
      return;
    }
    // accept full URLs too
    const match = id.match(/[?&]id=([a-z0-9-]+)/i);
    const roomId = match ? match[1] : id;
    router.push(`/room?id=${roomId}`);
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center px-4 bg-zinc-950">
      {/* hero */}
      <div className="mb-10 text-center select-none">
        <div className="text-6xl mb-4">🎬</div>
        <h1 className="text-4xl font-bold text-white tracking-tight">WatchWith</h1>
        <p className="mt-2 text-white/50 text-sm max-w-xs">
          Watch movies together — real screen audio, automatic voice ducking,
          zero setup.
        </p>
      </div>

      {/* card */}
      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6 shadow-2xl border border-white/5 flex flex-col gap-5">
        {/* create */}
        <button
          onClick={createRoom}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-sm transition-all"
        >
          🍿 Create a room
        </button>

        <div className="flex items-center gap-3 text-white/20 text-xs">
          <hr className="flex-1 border-white/10" />
          or join one
          <hr className="flex-1 border-white/10" />
        </div>

        {/* join */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            placeholder="Room code or invite link"
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={joinRoom}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white text-sm transition-all"
          >
            Join room →
          </button>
        </div>
      </div>

      {/* feature pills */}
      <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs text-white/30 max-w-sm">
        {[
          '🔊 Tab audio captured',
          '🎙️ Auto voice ducking',
          '▶️ Synced playback',
          '😂 Reactions',
          '📹 Face cams',
          '💬 Chat',
          '🔒 P2P encrypted',
        ].map((f) => (
          <span key={f} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
            {f}
          </span>
        ))}
      </div>
    </main>
  );
}
