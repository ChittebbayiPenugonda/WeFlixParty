/**
 * Firestore-backed WebRTC signaling.
 *
 * Room document layout:
 *   rooms/{roomId}
 *     offer          { type, sdp, ts }   — ts used to detect renegotiation
 *     answer         { type, sdp, ts }
 *     guestJoined    boolean             — guest sets true to trigger host offer
 *     hostScreenStreamId  string | null
 *     guestScreenStreamId string | null
 *     sync           { event, currentTime, ts }
 *     offerCandidates/   (subcollection)
 *     answerCandidates/  (subcollection)
 *     reactions/         (subcollection)
 *     messages/          (subcollection)
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type SyncEvent = 'play' | 'pause' | 'seek';

export interface SyncPayload {
  event: SyncEvent;
  currentTime: number;
  ts: number;
}

export interface ChatMessage {
  text: string;
  sender: 'host' | 'guest';
  ts: number;
}

export interface Reaction {
  emoji: string;
  sender: 'host' | 'guest';
  ts: number;
}

// ─── Room lifecycle ────────────────────────────────────────────────────────

export async function createRoom(roomId: string): Promise<void> {
  await setDoc(doc(db, 'rooms', roomId), {
    createdAt: serverTimestamp(),
    offer: null,
    answer: null,
    guestJoined: false,
    hostScreenStreamId: null,
    guestScreenStreamId: null,
    sync: null,
  });
}

export async function roomExists(roomId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'rooms', roomId));
  return snap.exists();
}

// ─── Guest presence ────────────────────────────────────────────────────────

export async function signalGuestJoined(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { guestJoined: true });
}

export function onGuestJoined(roomId: string, cb: () => void): Unsubscribe {
  let fired = false;
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (fired) return;
    const data = snap.data();
    if (data?.guestJoined === true) {
      fired = true;
      cb();
    }
  });
}

// ─── SDP offer / answer ────────────────────────────────────────────────────

export interface TimestampedSDP extends RTCSessionDescriptionInit {
  ts: number;
}

export async function writeOffer(
  roomId: string,
  offer: RTCSessionDescriptionInit,
): Promise<void> {
  const payload: TimestampedSDP = { ...offer, ts: Date.now() };
  await updateDoc(doc(db, 'rooms', roomId), { offer: payload, answer: null });
}

export async function writeAnswer(
  roomId: string,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  const payload: TimestampedSDP = { ...answer, ts: Date.now() };
  await updateDoc(doc(db, 'rooms', roomId), { answer: payload });
}

export function onOffer(
  roomId: string,
  cb: (offer: TimestampedSDP) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    const data = snap.data();
    if (data?.offer) cb(data.offer as TimestampedSDP);
  });
}

export function onAnswer(
  roomId: string,
  cb: (answer: TimestampedSDP) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    const data = snap.data();
    if (data?.answer) cb(data.answer as TimestampedSDP);
  });
}

// ─── ICE candidates ────────────────────────────────────────────────────────

export async function addIceCandidate(
  roomId: string,
  role: 'offerCandidates' | 'answerCandidates',
  candidate: RTCIceCandidateInit,
): Promise<void> {
  await addDoc(collection(db, 'rooms', roomId, role), candidate);
}

export function onIceCandidates(
  roomId: string,
  role: 'offerCandidates' | 'answerCandidates',
  cb: (candidate: RTCIceCandidateInit) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'rooms', roomId, role), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') cb(change.doc.data() as RTCIceCandidateInit);
    });
  });
}

// ─── Screen-share stream IDs ───────────────────────────────────────────────

export async function setScreenStreamId(
  roomId: string,
  role: 'hostScreenStreamId' | 'guestScreenStreamId',
  streamId: string | null,
): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { [role]: streamId });
}

export function onScreenStreamIds(
  roomId: string,
  cb: (hostId: string | null, guestId: string | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    const data = snap.data();
    if (!data) return;
    cb(
      (data.hostScreenStreamId as string | null) ?? null,
      (data.guestScreenStreamId as string | null) ?? null,
    );
  });
}

// ─── Playback sync ─────────────────────────────────────────────────────────

export async function writeSync(roomId: string, payload: SyncPayload): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { sync: payload });
}

export function onSync(
  roomId: string,
  cb: (payload: SyncPayload) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    const data = snap.data();
    if (data?.sync) cb(data.sync as SyncPayload);
  });
}

// ─── Reactions ─────────────────────────────────────────────────────────────

export async function sendReaction(
  roomId: string,
  emoji: string,
  sender: 'host' | 'guest',
): Promise<void> {
  await addDoc(collection(db, 'rooms', roomId, 'reactions'), {
    emoji,
    sender,
    ts: Date.now(),
  });
}

export function onReactions(
  roomId: string,
  cb: (r: Reaction) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'rooms', roomId, 'reactions'), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') cb(change.doc.data() as Reaction);
    });
  });
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  roomId: string,
  text: string,
  sender: 'host' | 'guest',
): Promise<void> {
  await addDoc(collection(db, 'rooms', roomId, 'messages'), {
    text,
    sender,
    ts: Date.now(),
  });
}

export function onChatMessages(
  roomId: string,
  cb: (msgs: ChatMessage[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'rooms', roomId, 'messages'),
    orderBy('ts', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as ChatMessage));
  });
}
