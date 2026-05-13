'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface FaceCamProps {
  stream: MediaStream | null;
  label: string;
  mirrored?: boolean;
  position?: 'bottom-right' | 'bottom-left';
  isHost?: boolean;
}

interface Pos { x: number; y: number }
interface Size { w: number; h: number }

const DEFAULT_SIZE: Size = { w: 192, h: 128 };
const MIN_SIZE: Size = { w: 96, h: 64 };

function getInitialPos(position: 'bottom-right' | 'bottom-left'): Pos {
  if (typeof window === 'undefined') return { x: 16, y: 16 };
  const padding = 16;
  const bottomOffset = 80; // clear the controls bar
  return position === 'bottom-right'
    ? { x: window.innerWidth - DEFAULT_SIZE.w - padding, y: window.innerHeight - DEFAULT_SIZE.h - bottomOffset }
    : { x: padding, y: window.innerHeight - DEFAULT_SIZE.h - bottomOffset };
}

export default function FaceCam({
  stream,
  label,
  mirrored = false,
  position = 'bottom-right',
  isHost = false,
}: FaceCamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<Pos>(() => getInitialPos(position));
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);

  // Refs track live drag/resize values without causing mid-gesture re-renders
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resize = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.muted = true;
    video.play().catch(() => undefined);
  }, [stream]);

  // ── drag ─────────────────────────────────────────────────────────────────

  const onDragDown = useCallback((e: React.PointerEvent) => {
    // Don't start a drag on the resize handle
    if ((e.target as HTMLElement).dataset.resize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    const newX = Math.max(0, Math.min(window.innerWidth - size.w, drag.current.origX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - size.h, drag.current.origY + dy));
    setPos({ x: newX, y: newY });
  }, [size]);

  const onDragUp = useCallback(() => {
    drag.current = null;
  }, []);

  // ── resize ────────────────────────────────────────────────────────────────

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); // don't trigger drag
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
  }, [size]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resize.current) return;
    const dx = e.clientX - resize.current.startX;
    const dy = e.clientY - resize.current.startY;
    setSize({
      w: Math.max(MIN_SIZE.w, resize.current.origW + dx),
      h: Math.max(MIN_SIZE.h, resize.current.origH + dy),
    });
  }, []);

  const onResizeUp = useCallback(() => {
    resize.current = null;
  }, []);

  if (!stream) return null;

  return (
    <div
      ref={containerRef}
      onPointerDown={onDragDown}
      onPointerMove={(e) => { onDragMove(e); onResizeMove(e); }}
      onPointerUp={(e) => { onDragUp(); onResizeUp(); }}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      className="absolute rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl z-20 cursor-grab active:cursor-grabbing select-none"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover${mirrored ? ' scale-x-[-1]' : ''}`}
      />

      {/* label */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-2 py-1 bg-black/50 text-white text-xs pointer-events-none">
        {isHost && <span>👑</span>}
        <span className="truncate">{label}</span>
      </div>

      {/* resize handle — bottom-right corner */}
      <div
        data-resize="true"
        onPointerDown={onResizeDown}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)',
        }}
      />
    </div>
  );
}
