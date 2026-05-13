'use client';

import { useEffect, useRef, useCallback } from 'react';
import { sendReaction, onReactions, type Reaction } from '@/lib/signaling';

const DEFAULT_EMOJIS = ['😂', '🤯', '😱', '❤️', '👏', '😭', '🔥', '💀'];

const CUSTOM_IMAGES = [
  '/customReactions/r1.png',
  '/customReactions/r2.png',
  '/customReactions/r3.png',
  '/customReactions/r4.png',
  '/customReactions/r5.png',
  '/customReactions/r6.png',
  '/customReactions/r7.jpg',
  '/customReactions/r8.png',
];

interface ReactionBarProps {
  roomId: string;
  role: 'host' | 'guest';
  customMode?: boolean;
  basePath?: string;
}

export default function ReactionBar({ roomId, role, customMode = false, basePath = '' }: ReactionBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const spawnReaction = useCallback((value: string) => {
    const container = containerRef.current;
    if (!container) return;

    const isImage = value.startsWith('img:');
    const el = document.createElement('div');
    el.className = 'reaction-float';
    el.style.left = `${10 + Math.random() * 80}%`;

    if (isImage) {
      const src = basePath + value.slice(4); // strip 'img:' prefix
      const img = document.createElement('img');
      img.src = src;
      img.style.cssText = 'width:90px;height:auto;border-radius:8px;pointer-events:none;';
      el.appendChild(img);
    } else {
      el.textContent = value;
      el.style.fontSize = '2rem';
    }

    container.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }, [basePath]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onReactions(roomId, (r: Reaction) => {
      spawnReaction(r.emoji);
    });
    return unsub;
  }, [roomId, spawnReaction]);

  const handleClick = useCallback(
    (value: string) => {
      sendReaction(roomId, value, role).catch(console.error);
    },
    [roomId, role],
  );

  return (
    <>
      {/* floating reaction stage */}
      <div
        ref={containerRef}
        className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
      />

      {/* buttons */}
      <div className="flex items-center gap-1">
        {customMode
          ? CUSTOM_IMAGES.map((src, i) => (
              <button
                key={i}
                onClick={() => handleClick(`img:${src}`)}
                className="w-9 h-9 rounded-lg overflow-hidden hover:scale-110 active:scale-95 transition-transform border border-white/10"
                aria-label={`Custom reaction ${i + 1}`}
              >
                <img
                  src={basePath + src}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))
          : DEFAULT_EMOJIS.map((e) => (
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
