'use client';

import { useRef, useCallback, useEffect } from 'react';

// VAD auto-duck: just enough to make remote voice clearly audible
const VAD_DUCK_GAIN    = 0.06;
// Manual override (spacebar / button): near-silent so you can speak freely
const MANUAL_DUCK_GAIN = 0.01;

const DUCK_RAMP_MS    = 80;   // fade down
const RESTORE_RAMP_MS = 400;  // fade back up
const VAD_THRESHOLD   = 0.018;
const SILENCE_HOLD_MS = 700;

export function useAudioDucking() {
  const ctx         = useRef<AudioContext | null>(null);
  const movieGain   = useRef<GainNode | null>(null);
  const analyser    = useRef<AnalyserNode | null>(null);
  const vadSource   = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafId       = useRef<number>(0);
  const silenceTimer= useRef<ReturnType<typeof setTimeout> | null>(null);

  // Two independent ducking flags — both can be active at once.
  // We always apply the lower (quieter) of the two targets.
  const vadActive    = useRef(false);
  const manualActive = useRef(false);

  const movieSources = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  function getCtx(): AudioContext {
    if (!ctx.current || ctx.current.state === 'closed') {
      ctx.current = new AudioContext();
    }
    if (ctx.current.state === 'suspended') ctx.current.resume();
    return ctx.current;
  }

  // ── apply the right gain based on which flags are set ────────────────────

  function applyGain() {
    const gain    = movieGain.current;
    const audioCtx = ctx.current;
    if (!gain || !audioCtx) return;

    const target = manualActive.current
      ? MANUAL_DUCK_GAIN
      : vadActive.current
        ? VAD_DUCK_GAIN
        : 1;

    const rampMs = target < (gain.gain.value ?? 1) ? DUCK_RAMP_MS : RESTORE_RAMP_MS;
    gain.gain.cancelScheduledValues(audioCtx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(target, audioCtx.currentTime + rampMs / 1000);
  }

  // ── connect movie/screen-share audio through the gain node ───────────────

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
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(movieGain.current);
    movieSources.current.set(stream.id, source);
  }, []);

  const disconnectMovieAudio = useCallback((stream: MediaStream) => {
    const source = movieSources.current.get(stream.id);
    if (!source) return;
    source.disconnect();
    movieSources.current.delete(stream.id);
  }, []);

  // ── VAD on the remote stream (auto-duck when they speak) ─────────────────

  const startVAD = useCallback((remoteStream: MediaStream) => {
    const audioCtx = getCtx();

    vadSource.current?.disconnect();
    vadSource.current = audioCtx.createMediaStreamSource(remoteStream);

    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    analyser.current = an;
    vadSource.current.connect(an);
    // NOT connected to destination — analysis only, no double-playback

    const buf = new Float32Array(an.fftSize);

    function tick() {
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);

      if (rms > VAD_THRESHOLD) {
        if (!vadActive.current) {
          vadActive.current = true;
          applyGain();
        }
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          vadActive.current = false;
          applyGain(); // restore (or stay at manual level if spacebar held)
        }, SILENCE_HOLD_MS);
      }

      rafId.current = requestAnimationFrame(tick);
    }

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(tick);
  }, []);

  const stopVAD = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    vadSource.current?.disconnect();
    vadSource.current = null;
    vadActive.current = false;
    applyGain();
  }, []);

  // ── manual push-to-talk (spacebar / button) ───────────────────────────────

  const pushToTalkStart = useCallback(() => {
    manualActive.current = true;
    applyGain(); // immediately go to MANUAL_DUCK_GAIN (quieter than VAD level)
  }, []);

  const pushToTalkEnd = useCallback(() => {
    manualActive.current = false;
    applyGain(); // restore to VAD level (if still speaking) or 1.0
  }, []);

  // ── volume slider ─────────────────────────────────────────────────────────

  const setMovieVolume = useCallback((vol: number) => {
    const gain    = movieGain.current;
    const audioCtx = ctx.current;
    if (!gain || !audioCtx) return;
    gain.gain.cancelScheduledValues(audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  }, []);

  // ── cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafId.current);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
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
