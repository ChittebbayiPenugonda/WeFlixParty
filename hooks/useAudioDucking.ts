'use client';

import { useRef, useCallback, useEffect } from 'react';

const VAD_DUCK_GAIN    = 0.06;   // auto-duck when remote speaks
const MANUAL_DUCK_GAIN = 0.01;   // spacebar override — near-silent
const VAD_RAMP_MS      = 80;
const VAD_RESTORE_MS   = 400;
const VAD_THRESHOLD    = 0.018;
const SILENCE_HOLD_MS  = 700;

export function useAudioDucking() {
  const ctx        = useRef<AudioContext | null>(null);
  const movieGain  = useRef<GainNode | null>(null);
  const vadSource  = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafId      = useRef<number>(0);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadActive  = useRef(false);
  const manualOn   = useRef(false);
  const movieSources = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  function getCtx(): AudioContext {
    if (!ctx.current || ctx.current.state === 'closed') {
      ctx.current = new AudioContext();
    }
    if (ctx.current.state === 'suspended') ctx.current.resume();
    return ctx.current;
  }

  // ── connect screen-share / movie audio through the duck gain node ─────────

  const connectMovieAudio = useCallback((stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return;
    const audioCtx = getCtx();

    if (!movieGain.current) {
      const g = audioCtx.createGain();
      g.gain.value = 1;
      g.connect(audioCtx.destination);
      movieGain.current = g;
    }

    if (movieSources.current.has(stream.id)) return;
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(movieGain.current);
    movieSources.current.set(stream.id, src);
  }, []);

  const disconnectMovieAudio = useCallback((stream: MediaStream) => {
    const src = movieSources.current.get(stream.id);
    if (!src) return;
    src.disconnect();
    movieSources.current.delete(stream.id);
  }, []);

  // ── VAD: auto-duck when remote person speaks ──────────────────────────────

  const startVAD = useCallback((remoteStream: MediaStream) => {
    cancelAnimationFrame(rafId.current);
    vadSource.current?.disconnect();

    const audioCtx = getCtx();
    vadSource.current = audioCtx.createMediaStreamSource(remoteStream);
    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    vadSource.current.connect(an);
    // NOT to destination — analysis only

    const buf = new Float32Array(an.fftSize);

    function tick() {
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);

      if (rms > VAD_THRESHOLD) {
        if (!vadActive.current) {
          vadActive.current = true;
          vadDuck();
        }
        if (silenceRef.current) clearTimeout(silenceRef.current);
        silenceRef.current = setTimeout(() => {
          vadActive.current = false;
          vadRestore();
        }, SILENCE_HOLD_MS);
      }

      rafId.current = requestAnimationFrame(tick);
    }
    rafId.current = requestAnimationFrame(tick);
  }, []);

  const stopVAD = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    if (silenceRef.current) clearTimeout(silenceRef.current);
    vadSource.current?.disconnect();
    vadSource.current = null;
    vadActive.current = false;
    vadRestore();
  }, []);

  // VAD transitions — only apply if manual override isn't active
  function vadDuck() {
    if (manualOn.current) return; // manual already has it quieter, don't interfere
    const g = movieGain.current; const ac = ctx.current;
    if (!g || !ac) return;
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(g.gain.value, ac.currentTime);
    g.gain.linearRampToValueAtTime(VAD_DUCK_GAIN, ac.currentTime + VAD_RAMP_MS / 1000);
  }

  function vadRestore() {
    if (manualOn.current) return; // leave gain alone while spacebar is held
    const g = movieGain.current; const ac = ctx.current;
    if (!g || !ac) return;
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(g.gain.value, ac.currentTime);
    g.gain.linearRampToValueAtTime(1, ac.currentTime + VAD_RESTORE_MS / 1000);
  }

  // ── Manual override (spacebar / button) — completely independent of VAD ───
  // Pressing space snaps the gain to near-zero immediately, full stop.
  // Releasing space restores — to VAD duck level if VAD is active, else 1.0.

  const pushToTalkStart = useCallback(() => {
    manualOn.current = true;
    const g = movieGain.current;
    const ac = getCtx();
    if (!g) return;
    // Instant snap — no ramp, no interaction with VAD
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(MANUAL_DUCK_GAIN, ac.currentTime);
  }, []);

  const pushToTalkEnd = useCallback(() => {
    manualOn.current = false;
    const g = movieGain.current; const ac = ctx.current;
    if (!g || !ac) return;
    // Restore to appropriate level
    const target = vadActive.current ? VAD_DUCK_GAIN : 1;
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(g.gain.value, ac.currentTime);
    g.gain.linearRampToValueAtTime(target, ac.currentTime + VAD_RESTORE_MS / 1000);
  }, []);

  // ── volume slider ─────────────────────────────────────────────────────────

  const setMovieVolume = useCallback((vol: number) => {
    const g = movieGain.current; const ac = ctx.current;
    if (!g || !ac) return;
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(vol, ac.currentTime);
  }, []);

  // ── cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafId.current);
      if (silenceRef.current) clearTimeout(silenceRef.current);
      ctx.current?.close();
    };
  }, []);

  return {
    connectMovieAudio,
    disconnectMovieAudio,
    startVAD,
    stopVAD,
    pushToTalkStart,
    pushToTalkEnd,
    setMovieVolume,
  };
}
