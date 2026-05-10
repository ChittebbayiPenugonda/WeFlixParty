'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  writeOffer,
  writeAnswer,
  onOffer,
  onAnswer,
  onGuestJoined,
  signalGuestJoined,
  addIceCandidate,
  onIceCandidates,
  setScreenStreamId,
  onScreenStreamIds,
  type TimestampedSDP,
} from '@/lib/signaling';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

interface UseWebRTCOptions {
  roomId: string;
  isHost: boolean;
  onPeerConnected?: () => void;
  onPeerDisconnected?: () => void;
}

export interface WebRTCState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  isScreenSharing: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  connectionState: RTCPeerConnectionState | 'idle';
}

export function useWebRTC({
  roomId,
  isHost,
  onPeerConnected,
  onPeerDisconnected,
}: UseWebRTCOptions) {
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);
  const makingOffer = useRef(false);
  const remoteScreenIdRef = useRef<string | null>(null);

  // Track which offer/answer timestamps we've already processed to prevent
  // Firestore snapshot re-fires from reprocessing the same SDP.
  const lastOfferTs = useRef(0);
  const lastAnswerTs = useRef(0);

  const [state, setState] = useState<WebRTCState>({
    localStream: null,
    remoteStream: null,
    remoteScreenStream: null,
    isScreenSharing: false,
    isMicOn: true,
    isCamOn: true,
    connectionState: 'idle',
  });

  function updateState(partial: Partial<WebRTCState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  async function drainPendingCandidates() {
    if (!pc.current) return;
    for (const c of pendingCandidates.current) {
      try {
        await pc.current.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) { /* stale candidates are harmless */ }
    }
    pendingCandidates.current = [];
  }

  // ── build peer connection ─────────────────────────────────────────────────

  const buildPC = useCallback((): RTCPeerConnection => {
    const conn = new RTCPeerConnection(ICE_CONFIG);

    conn.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const role = isHost ? 'offerCandidates' : 'answerCandidates';
      addIceCandidate(roomId, role, candidate.toJSON()).catch(console.error);
    };

    conn.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', conn.connectionState);
      updateState({ connectionState: conn.connectionState });
      if (conn.connectionState === 'connected') onPeerConnected?.();
      if (conn.connectionState === 'disconnected' || conn.connectionState === 'failed') {
        onPeerDisconnected?.();
      }
    };

    conn.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', conn.iceConnectionState);
      if (conn.iceConnectionState === 'connected' || conn.iceConnectionState === 'completed') {
        onPeerConnected?.();
      }
    };

    conn.ontrack = ({ track, streams }) => {
      const stream = streams[0];
      if (!stream) return;
      console.log('[WebRTC] ontrack:', track.kind, 'streamId:', stream.id, 'remoteScreenId:', remoteScreenIdRef.current);

      if (stream.id === remoteScreenIdRef.current) {
        setState((prev) => {
          if (prev.remoteScreenStream?.id === stream.id) return prev;
          return { ...prev, remoteScreenStream: stream };
        });
      } else {
        setState((prev) => {
          if (prev.remoteStream?.id === stream.id) return prev;
          return { ...prev, remoteStream: stream };
        });
      }
    };

    // onnegotiationneeded only runs after initial connection for renegotiation
    // (screen share add/remove). The initial offer is triggered by guestJoined.
    conn.onnegotiationneeded = async () => {
      if (!isHost) return;
      if (!remoteDescSet.current) return; // not yet connected; initial offer handled separately
      if (makingOffer.current) return;
      console.log('[WebRTC] renegotiation needed');
      try {
        makingOffer.current = true;
        const offer = await conn.createOffer();
        if (conn.signalingState !== 'stable') return;
        await conn.setLocalDescription(offer);
        await writeOffer(roomId, conn.localDescription!);
      } catch (e) {
        console.error('[WebRTC] renegotiation offer failed:', e);
      } finally {
        makingOffer.current = false;
      }
    };

    return conn;
  }, [roomId, isHost, onPeerConnected, onPeerDisconnected]);

  // ── start webcam ──────────────────────────────────────────────────────────

  const startWebcam = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      updateState({ localStream: stream, isMicOn: true, isCamOn: true });

      if (!pc.current) pc.current = buildPC();
      stream.getTracks().forEach((t) => pc.current!.addTrack(t, stream));
      console.log('[WebRTC] webcam started, tracks added');
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      return null;
    }
  }, [buildPC]);

  // ── screen share ──────────────────────────────────────────────────────────

  const startScreenShare = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = stream;

      const role = isHost ? 'hostScreenStreamId' : 'guestScreenStreamId';
      await setScreenStreamId(roomId, role, stream.id);

      if (!pc.current) pc.current = buildPC();
      stream.getTracks().forEach((t) => pc.current!.addTrack(t, stream));
      console.log('[WebRTC] screen share started, streamId:', stream.id);

      updateState({ isScreenSharing: true });
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      return stream;
    } catch (err) {
      console.error('[WebRTC] getDisplayMedia failed:', err);
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost, buildPC]);

  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      t.stop();
      const sender = pc.current?.getSenders().find((s) => s.track?.id === t.id);
      if (sender) pc.current?.removeTrack(sender);
    });
    screenStreamRef.current = null;
    const role = isHost ? 'hostScreenStreamId' : 'guestScreenStreamId';
    await setScreenStreamId(roomId, role, null);
    updateState({ isScreenSharing: false, remoteScreenStream: null });
  }, [roomId, isHost]);

  // ── mic / cam toggles ─────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    tracks.forEach((t) => { t.enabled = !t.enabled; });
    updateState({ isMicOn: tracks[0]?.enabled ?? false });
  }, []);

  const toggleCam = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    tracks.forEach((t) => { t.enabled = !t.enabled; });
    updateState({ isCamOn: tracks[0]?.enabled ?? false });
  }, []);

  // ── create initial offer (host only, called after guest joins) ─────────────

  const createInitialOffer = useCallback(async () => {
    if (!isHost || !pc.current) return;
    if (makingOffer.current) return;
    console.log('[WebRTC] creating initial offer');
    try {
      makingOffer.current = true;
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await writeOffer(roomId, pc.current.localDescription!);
      console.log('[WebRTC] initial offer written to Firestore');
    } catch (e) {
      console.error('[WebRTC] createInitialOffer failed:', e);
    } finally {
      makingOffer.current = false;
    }
  }, [roomId, isHost]);

  // ── signaling listeners ───────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onScreenStreamIds(roomId, (hostId, guestId) => {
        remoteScreenIdRef.current = isHost ? guestId : hostId;
        console.log('[WebRTC] remoteScreenId:', remoteScreenIdRef.current);
      }),
    );

    if (isHost) {
      // Host waits for guest to signal presence, then creates the initial offer
      unsubs.push(
        onGuestJoined(roomId, () => {
          console.log('[WebRTC] guest joined, creating offer');
          createInitialOffer();
        }),
      );

      // Host receives guest's answer
      unsubs.push(
        onAnswer(roomId, async (answer: TimestampedSDP) => {
          if (!pc.current) return;
          if (answer.ts <= lastAnswerTs.current) return; // already processed
          if (pc.current.signalingState !== 'have-local-offer') return;
          lastAnswerTs.current = answer.ts;
          console.log('[WebRTC] host received answer, applying...');
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
            remoteDescSet.current = true;
            await drainPendingCandidates();
            console.log('[WebRTC] remote description set (answer)');
          } catch (e) {
            console.error('[WebRTC] setRemoteDescription(answer) failed:', e);
          }
        }),
      );

      // Host collects guest's ICE candidates
      unsubs.push(
        onIceCandidates(roomId, 'answerCandidates', async (candidate) => {
          if (!pc.current) return;
          if (!remoteDescSet.current) {
            pendingCandidates.current.push(candidate);
          } else {
            try {
              await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (_) { /* ignore */ }
          }
        }),
      );
    } else {
      // Guest receives host's offer
      unsubs.push(
        onOffer(roomId, async (offer: TimestampedSDP) => {
          if (!pc.current) return;
          if (offer.ts <= lastOfferTs.current) return; // already processed
          lastOfferTs.current = offer.ts;
          console.log('[WebRTC] guest received offer, processing...');
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescSet.current = true;
            await drainPendingCandidates();

            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            await writeAnswer(roomId, answer);
            console.log('[WebRTC] answer written to Firestore');
          } catch (e) {
            console.error('[WebRTC] offer handling failed:', e);
          }
        }),
      );

      // Guest collects host's ICE candidates
      unsubs.push(
        onIceCandidates(roomId, 'offerCandidates', async (candidate) => {
          if (!pc.current) return;
          if (!remoteDescSet.current) {
            pendingCandidates.current.push(candidate);
          } else {
            try {
              await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (_) { /* ignore */ }
          }
        }),
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [roomId, isHost, buildPC, createInitialOffer]);

  // ── cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
    };
  }, []);

  return {
    ...state,
    startWebcam,
    startScreenShare,
    stopScreenShare,
    toggleMic,
    toggleCam,
    createInitialOffer,
  };
}
