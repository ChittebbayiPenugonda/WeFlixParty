'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  writeOffer,
  writeAnswer,
  onOffer,
  onAnswer,
  addIceCandidate,
  onIceCandidates,
  setScreenStreamId,
  onScreenStreamIds,
} from '@/lib/signaling';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
  remoteStream: MediaStream | null;        // remote webcam
  remoteScreenStream: MediaStream | null;  // remote screen share
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
  // track which remote stream ID is screen share
  const remoteScreenIdRef = useRef<string | null>(null);

  const [state, setState] = useState<WebRTCState>({
    localStream: null,
    remoteStream: null,
    remoteScreenStream: null,
    isScreenSharing: false,
    isMicOn: true,
    isCamOn: true,
    connectionState: 'idle',
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  function updateState(partial: Partial<WebRTCState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  async function drainPendingCandidates() {
    if (!pc.current) return;
    for (const c of pendingCandidates.current) {
      try {
        await pc.current.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) { /* ignore */ }
    }
    pendingCandidates.current = [];
  }

  // ── build peer connection ─────────────────────────────────────────────────

  function buildPC(): RTCPeerConnection {
    const conn = new RTCPeerConnection(ICE_CONFIG);

    conn.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const role = isHost ? 'offerCandidates' : 'answerCandidates';
      addIceCandidate(roomId, role, candidate.toJSON());
    };

    conn.onconnectionstatechange = () => {
      updateState({ connectionState: conn.connectionState });
      if (conn.connectionState === 'connected') onPeerConnected?.();
      if (
        conn.connectionState === 'disconnected' ||
        conn.connectionState === 'failed'
      ) onPeerDisconnected?.();
    };

    // collect all incoming tracks into streams
    conn.ontrack = ({ track, streams }) => {
      const stream = streams[0];
      if (!stream) return;

      if (stream.id === remoteScreenIdRef.current) {
        // this track belongs to the remote screen share stream
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

    conn.onnegotiationneeded = async () => {
      // only the host drives renegotiation to avoid glare
      if (!isHost || makingOffer.current) return;
      try {
        makingOffer.current = true;
        await conn.setLocalDescription();
        if (conn.localDescription) await writeOffer(roomId, conn.localDescription);
      } finally {
        makingOffer.current = false;
      }
    };

    return conn;
  }

  // ── start webcam ─────────────────────────────────────────────────────────

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      updateState({ localStream: stream, isMicOn: true, isCamOn: true });

      if (!pc.current) {
        pc.current = buildPC();
      }
      stream.getTracks().forEach((t) => pc.current!.addTrack(t, stream));
      return stream;
    } catch (err) {
      console.error('getUserMedia failed', err);
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ── screen share ──────────────────────────────────────────────────────────

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // capture tab audio when available
      });
      screenStreamRef.current = stream;

      // tell the remote peer which stream ID is our screen share
      const role = isHost ? 'hostScreenStreamId' : 'guestScreenStreamId';
      await setScreenStreamId(roomId, role, stream.id);

      if (!pc.current) pc.current = buildPC();
      stream.getTracks().forEach((t) => pc.current!.addTrack(t, stream));

      updateState({ isScreenSharing: true });

      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      return stream;
    } catch (err) {
      console.error('getDisplayMedia failed', err);
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current;
    if (!stream) return;

    stream.getTracks().forEach((t) => {
      t.stop();
      const sender = pc.current
        ?.getSenders()
        .find((s) => s.track?.id === t.id);
      if (sender) pc.current?.removeTrack(sender);
    });

    screenStreamRef.current = null;
    const role = isHost ? 'hostScreenStreamId' : 'guestScreenStreamId';
    await setScreenStreamId(roomId, role, null);
    updateState({ isScreenSharing: false });
  }, [roomId, isHost]);

  // ── mic / cam toggles ─────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    updateState({ isMicOn: localStreamRef.current!.getAudioTracks()[0]?.enabled ?? false });
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    updateState({ isCamOn: localStreamRef.current!.getVideoTracks()[0]?.enabled ?? false });
  }, []);

  // ── signaling listeners ───────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return;

    const unsubs: Array<() => void> = [];

    // track which stream ID the remote is using for screen share
    unsubs.push(
      onScreenStreamIds(roomId, (hostId, guestId) => {
        // if I'm the host, the remote's screen stream = guestId, and vice versa
        remoteScreenIdRef.current = isHost ? guestId : hostId;
      }),
    );

    if (isHost) {
      // host: wait for guest's answer
      unsubs.push(
        onAnswer(roomId, async (answer) => {
          if (!pc.current || pc.current.signalingState === 'stable') return;
          await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
          remoteDescSet.current = true;
          await drainPendingCandidates();
        }),
      );
      // host: collect answer ICE candidates
      unsubs.push(
        onIceCandidates(roomId, 'answerCandidates', async (candidate) => {
          if (!pc.current) return;
          if (!remoteDescSet.current) {
            pendingCandidates.current.push(candidate);
          } else {
            await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }),
      );
    } else {
      // guest: receive offer from host, then answer
      unsubs.push(
        onOffer(roomId, async (offer) => {
          if (!pc.current) pc.current = buildPC();
          await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
          remoteDescSet.current = true;
          await drainPendingCandidates();

          const answer = await pc.current.createAnswer();
          await pc.current.setLocalDescription(answer);
          await writeAnswer(roomId, answer);
        }),
      );
      // guest: collect offer ICE candidates
      unsubs.push(
        onIceCandidates(roomId, 'offerCandidates', async (candidate) => {
          if (!pc.current) return;
          if (!remoteDescSet.current) {
            pendingCandidates.current.push(candidate);
          } else {
            await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }),
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ── kick off offer once webcam is ready (host only) ───────────────────────

  const initiateCall = useCallback(async () => {
    if (!isHost || !pc.current) return;
    makingOffer.current = true;
    try {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await writeOffer(roomId, offer);
    } finally {
      makingOffer.current = false;
    }
  }, [roomId, isHost]);

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
    initiateCall,
  };
}
