'use client';

import { useEffect, useRef, useCallback } from 'react';
import { sendReaction, onReactions, type Reaction } from '@/lib/signaling';

const EMOJIS = ['😂', '🤯', '😱', '❤️', '👏', '😭', '🔥', '💀'];

interface ReactionBarProps {
  roomId: string;
  role: 'host' | 'guest';
}

export default function ReactionBar({ roomId, role }: ReactionBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const spawnEmoji = useCallback((emoji: string) => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('div');
    el.textContent = emoji;
    el.className = 'reaction-float';

    // random horizontal position across container width
    const left = 10 + Math.random() * 80;
    el.style.left = `${left}%`;

    container.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onReactions(roomId, (r: Reaction) => {
      spawnEmoji(r.emoji);
    });
    return unsub;
  }, [roomId, spawnEmoji]);

  const handleClick = useCallback(
    (emoji: string) => {
      sendReaction(roomId, emoji, role).catch(console.error);
    },
    [roomId, role],
  );

  return (
    <>
      {/* floating emoji stage — covers the whole screen */}
      <div
        ref={containerRef}
        className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
      />

      {/* reaction button row */}
      <div className="flex items-center gap-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => handleClick(e)}
            className="text-xl leading-none p-1.5 rounded-lg hover:bg-white/10 active:scale-90 transition-transform"
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
