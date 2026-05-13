'use client';

import { useRef, useCallback, useEffect } from 'react';

const DUCK_GAIN = 0.03;       // volume when ducked — near-silent so voice is crystal clear
const DUCK_RAMP_MS = 100;     // fade down time
const RESTORE_RAMP_MS = 400;  // fade back up time
const VAD_THRESHOLD = 0.02;   // RMS threshold for voice detection
const SILENCE_HOLD_MS = 600;  // how long silence must last before restoring

export function useAudioDucking() {
  const ctx = useRef<AudioContext | null>(null);
  const movieGain = useRef<GainNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const micSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafId = useRef<number>(0);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeaking = useRef(false);
  // map streamId -> source node so we can tear down cleanly
  const movieSources = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  function getCtx(): AudioContext {
    if (!ctx.current || ctx.current.state === 'closed') {
      ctx.current = new AudioContext();
    }
    return ctx.current;
  }

  // ── connect remote audio (screen share or webcam) through the duck gain ──

  const connectMovieAudio = useCallback((stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return;

    const audioCtx = getCtx();

    if (!movieGain.current) {
      const gain = audioCtx.createGain();
      gain.gain.value = 1;
      gain.connect(audioCtx.destination);
      movieGain.current = gain;
    }

    if (movieSources.current.has(stream.id)) return; // already connected

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

  // ── voice activity detection on local mic ─────────────────────────────────

  const startVAD = useCallback((micStream: MediaStream) => {
    const audioCtx = getCtx();

    if (micSource.current) micSource.current.disconnect();
    micSource.current = audioCtx.createMediaStreamSource(micStream);

    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    analyser.current = an;
    micSource.current.connect(an);
    // intentionally NOT connecting to destination (avoid self-monitoring)

    const buf = new Float32Array(an.fftSize);

    function tick() {
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);

      if (rms > VAD_THRESHOLD) {
        if (!isSpeaking.current) {
          isSpeaking.current = true;
          duck();
        }
        if (silenceTimer.current) {
          clearTimeout(silenceTimer.current);
          silenceTimer.current = null;
        }
        silenceTimer.current = setTimeout(() => {
          isSpeaking.current = false;
          restore();
        }, SILENCE_HOLD_MS);
      }

      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);
  }, []);

  const stopVAD = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    micSource.current?.disconnect();
    micSource.current = null;
    isSpeaking.current = false;
    restore();
  }, []);

  // ── gain transitions ──────────────────────────────────────────────────────

  function duck() {
    const gain = movieGain.current;
    const audioCtx = ctx.current;
    if (!gain || !audioCtx) return;
    gain.gain.cancelScheduledValues(audioCtx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(
      DUCK_GAIN,
      audioCtx.currentTime + DUCK_RAMP_MS / 1000,
    );
  }

  function restore() {
    const gain = movieGain.current;
    const audioCtx = ctx.current;
    if (!gain || !audioCtx) return;
    gain.gain.cancelScheduledValues(audioCtx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(
      1,
      audioCtx.currentTime + RESTORE_RAMP_MS / 1000,
    );
  }

  // ── manual push-to-talk ────────────────────────────────────────────────────

  const pushToTalkStart = useCallback(() => {
    isSpeaking.current = true;
    duck();
  }, []);

  const pushToTalkEnd = useCallback(() => {
    isSpeaking.current = false;
    restore();
  }, []);

  // ── volume control ────────────────────────────────────────────────────────

  const setMovieVolume = useCallback((vol: number) => {
    const gain = movieGain.current;
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
