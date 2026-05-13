'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface DraggableVideoProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  defaultW?: number;
  defaultH?: number;
  /** Initial position — defaults to centre of screen */
  initialPos?: { x: number; y: number };
  onStop?: () => void;
}

interface Pos  { x: number; y: number }
interface Size { w: number; h: number }

const MIN: Size = { w: 160, h: 100 };

export default function DraggableVideo({
  stream,
  label,
  muted = false,
  defaultW = 480,
  defaultH = 300,
  initialPos,
  onStop,
}: DraggableVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [pos, setPos] = useState<Pos>(() => {
    if (initialPos) return initialPos;
    if (typeof window === 'undefined') return { x: 40, y: 40 };
    return {
      x: Math.max(0, (window.innerWidth  - defaultW) / 2),
      y: Math.max(0, (window.innerHeight - defaultH) / 2 - 60),
    };
  });
  const [size, setSize] = useState<Size>({ w: defaultW, h: defaultH });

  const drag   = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    v.play().catch(() => undefined);
  }, [stream]);

  // ── drag ─────────────────────────────────────────────────────────────────

  const onDragDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.resize) return;
    if ((e.target as HTMLElement).dataset.stop)   return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth  - size.w, drag.current.ox + e.clientX - drag.current.sx)),
      y: Math.max(0, Math.min(window.innerHeight - size.h, drag.current.oy + e.clientY - drag.current.sy)),
    });
  }, [size]);

  // ── resize ────────────────────────────────────────────────────────────────

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h };
  }, [size]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resize.current) return;
    setSize({
      w: Math.max(MIN.w, resize.current.ow + e.clientX - resize.current.sx),
      h: Math.max(MIN.h, resize.current.oh + e.clientY - resize.current.sy),
    });
  }, []);

  const onUp = useCallback(() => {
    drag.current   = null;
    resize.current = null;
  }, []);

  if (!stream) return null;

  return (
    <div
      onPointerDown={onDragDown}
      onPointerMove={(e) => { onDragMove(e); onResizeMove(e); }}
      onPointerUp={onUp}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      className="absolute rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl z-20 cursor-grab active:cursor-grabbing select-none bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
      />

      {/* title bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-black/60 text-white text-xs pointer-events-none">
        <span>🖥️ {label}</span>
      </div>

      {/* stop button */}
      {onStop && (
        <button
          data-stop="true"
          onClick={onStop}
          className="absolute top-1 right-1 px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-500 text-white text-xs z-10 pointer-events-auto"
        >
          Stop
        </button>
      )}

      {/* resize handle */}
      <div
        data-resize="true"
        onPointerDown={onResizeDown}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10"
        style={{ background: 'linear-gradient(135deg,transparent 50%,rgba(255,255,255,.35) 50%)' }}
      />
    </div>
  );
}
