// sounds.ts — UI sound effects for Fluxer Desktop.
//
// A lightweight, self-authored playback engine. The 19 sound assets in
// `media/sounds/` match the names the real Fluxer client uses so behaviour is
// 1:1, but this module is an independent implementation: a simple cache of
// preloaded HTMLAudioElements, a master volume + mute gate, and an
// autoplay-block-tolerant `play()`. The heavier Web Audio capture-bus path the
// reference uses (so call sounds can be mixed into a screen-share) is not
// needed here.

import cameraOff from "./media/sounds/camera-off.mp3";
import cameraOn from "./media/sounds/camera-on.mp3";
import deaf from "./media/sounds/deaf.mp3";
import inChannel from "./media/sounds/in-channel-notification.ogg";
import incomingRing from "./media/sounds/incoming-ring.mp3";
import message from "./media/sounds/message.mp3";
import mute from "./media/sounds/mute.mp3";
import pttActive from "./media/sounds/ptt-active.mp3";
import pttInactive from "./media/sounds/ptt-inactive.mp3";
import streamStart from "./media/sounds/stream-start.mp3";
import streamStop from "./media/sounds/stream-stop.mp3";
import undeaf from "./media/sounds/undeaf.mp3";
import unmute from "./media/sounds/unmute.mp3";
import userJoin from "./media/sounds/user-join.mp3";
import userLeave from "./media/sounds/user-leave.mp3";
import userMove from "./media/sounds/user-move.mp3";
import viewerJoin from "./media/sounds/viewer-join.mp3";
import viewerLeave from "./media/sounds/viewer-leave.mp3";
import voiceDisconnect from "./media/sounds/voice-disconnect.mp3";

export type SoundName =
  | "camera-off"
  | "camera-on"
  | "deaf"
  | "undeaf"
  | "mute"
  | "unmute"
  | "message"
  | "direct-message"
  | "same-channel-message"
  | "incoming-ring"
  | "ptt-active"
  | "ptt-inactive"
  | "stream-start"
  | "stream-stop"
  | "user-join"
  | "user-leave"
  | "user-move"
  | "viewer-join"
  | "viewer-leave"
  | "voice-disconnect";

const SOURCES: Record<SoundName, string> = {
  "camera-off": cameraOff,
  "camera-on": cameraOn,
  deaf,
  undeaf,
  mute,
  unmute,
  message,
  // DMs reuse the message sound, matching the reference client.
  "direct-message": message,
  "same-channel-message": inChannel,
  "incoming-ring": incomingRing,
  "ptt-active": pttActive,
  "ptt-inactive": pttInactive,
  "stream-start": streamStart,
  "stream-stop": streamStop,
  "user-join": userJoin,
  "user-leave": userLeave,
  "user-move": userMove,
  "viewer-join": viewerJoin,
  "viewer-leave": viewerLeave,
  "voice-disconnect": voiceDisconnect,
};

// Match the reference's perceived loudness ceiling.
const MAX_EFFECTIVE_VOLUME = 0.8;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

// Preloaded base elements (one per source URL) we clone-by-resetting on play.
const pool = new Map<SoundName, HTMLAudioElement>();
// Looping sounds (incoming ring) tracked so they can be stopped.
const looping = new Map<SoundName, HTMLAudioElement>();

let muted = false;
let masterVolume = 0.5;
let outputSinkId: string | null = null;

type SinkableAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

function element(name: SoundName): HTMLAudioElement {
  let el = pool.get(name);
  if (!el) {
    el = new Audio(SOURCES[name]);
    el.preload = "auto";
    pool.set(name, el);
  }
  return el;
}

/** Mute/unmute all UI sounds (e.g. from the notification settings toggle). */
export function setSoundsMuted(value: boolean): void {
  muted = value;
  if (value) stopAllLoops();
}

/** Master volume 0..1, applied on top of each call's per-sound volume. */
export function setMasterVolume(value: number): void {
  masterVolume = clamp(value);
}

/** Route sounds to a specific output device (falls back silently if unsupported). */
export function setSoundOutputDevice(deviceId: string | null): void {
  outputSinkId = deviceId && deviceId !== "default" ? deviceId : null;
}

function applySink(el: SinkableAudio): void {
  if (!outputSinkId || typeof el.setSinkId !== "function") return;
  void el.setSinkId(outputSinkId).catch(() => {});
}

/**
 * Play a one-shot (or looping) sound. Best-effort: autoplay-block errors are
 * swallowed so a blocked sound never throws into a UI handler.
 */
export function playSound(name: SoundName, opts: { loop?: boolean; volume?: number } = {}): void {
  if (muted) return;
  const volume = clamp((opts.volume ?? 0.4) * masterVolume, 0, MAX_EFFECTIVE_VOLUME);
  if (volume <= 0) return;

  if (opts.loop) {
    if (looping.has(name)) return; // already ringing
    const el = element(name).cloneNode() as HTMLAudioElement;
    el.loop = true;
    el.volume = volume;
    applySink(el as SinkableAudio);
    looping.set(name, el);
    void el.play().catch(() => looping.delete(name));
    return;
  }

  // One-shot: clone so overlapping plays don't cut each other off.
  const el = element(name).cloneNode() as HTMLAudioElement;
  el.loop = false;
  el.volume = volume;
  applySink(el as SinkableAudio);
  void el.play().catch(() => {});
}

/** Stop a looping sound started with `{ loop: true }` (e.g. the incoming ring). */
export function stopSound(name: SoundName): void {
  const el = looping.get(name);
  if (!el) return;
  el.pause();
  el.currentTime = 0;
  looping.delete(name);
}

export function stopAllLoops(): void {
  for (const name of [...looping.keys()]) stopSound(name);
}
