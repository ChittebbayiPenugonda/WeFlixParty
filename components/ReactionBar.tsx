'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

// Spawn into document.body via portal so reactions always float above
// every stacking context (screen share windows, face cams, controls bar).
function spawnReaction(value: string, basePath: string) {
  const stage = document.getElementById('reaction-stage');
  if (!stage) return;

  const isImage = value.startsWith('img:');
  const el = document.createElement('div');
  el.className = 'reaction-float';
  el.style.left = `${10 + Math.random() * 80}%`;

  if (isImage) {
    const img = document.createElement('img');
    img.src = basePath + value.slice(4);
    img.style.cssText = 'width:100px;height:auto;border-radius:10px;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,.5))';
    el.appendChild(img);
  } else {
    el.textContent = value;
    el.style.fontSize = '2.2rem';
  }

  stage.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

interface ReactionBarProps {
  roomId: string;
  role: 'host' | 'guest';
  customMode?: boolean;
  basePath?: string;
}

export default function ReactionBar({ roomId, role, customMode = false, basePath = '' }: ReactionBarProps) {
  useEffect(() => {
    if (!roomId) return;
    const unsub = onReactions(roomId, (r: Reaction) => {
      spawnReaction(r.emoji, basePath);
    });
    return unsub;
  }, [roomId, basePath]);

  const handleClick = useCallback(
    (value: string) => {
      sendReaction(roomId, value, role).catch(console.error);
    },
    [roomId, role],
  );

  // The floating stage lives in <body> via portal — escapes all stacking contexts.
  const stage = typeof document !== 'undefined'
    ? createPortal(
        <div
          id="reaction-stage"
          className="pointer-events-none fixed inset-0 overflow-hidden"
          style={{ zIndex: 9999 }}
        />,
        document.body,
      )
    : null;

  return (
    <>
      {stage}

      <div className="flex items-center gap-1">
        {customMode
          ? CUSTOM_IMAGES.map((src, i) => (
              <button
                key={i}
                onClick={() => handleClick(`img:${src}`)}
                className="w-9 h-9 rounded-lg overflow-hidden hover:scale-110 active:scale-95 transition-transform border border-white/10"
                aria-label={`Custom reaction ${i + 1}`}
              >
                <img src={basePath + src} alt="" className="w-full h-full object-cover" />
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
