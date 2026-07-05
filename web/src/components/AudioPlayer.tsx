// AudioPlayer: a custom-styled audio player for audio attachments and embeds.
// Replaces the inconsistent native `<audio controls>` with a compact bar:
// play/pause, seek (scrubber), current/total time, and a volume slider.
//
// The audio source is resolved through the on-disk media cache (`useAssetUrl`)
// so bytes download once + are reused across renders/navigations. The actual
// playback happens in a hidden `<audio>` element; this component drives it via
// a ref + the standard media events (timeupdate / loadedmetadata / ended).

import { useEffect, useRef, useState } from "react";
import { useAssetUrl } from "../utils/mediaCache";
import "./AudioPlayer.css";

export function AudioPlayer({
  url,
  /** Known duration in seconds (e.g. from an embed); shown until metadata loads. */
  duration: knownDuration,
  /** Optional label (e.g. filename) shown on the left. */
  title,
}: {
  url: string;
  duration?: number;
  title?: string;
}) {
  const src = useAssetUrl(url);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [volume, setVolume] = useState(1);

  // Reflect state changes from the audio element.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCurrent(t);
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    const v = Number(e.target.value);
    setVolume(v);
    if (a) a.volume = v;
  };

  // The seek range covers 0..duration. While the src is still resolving (no
  // src yet) we render a disabled placeholder so the layout doesn't jump.
  const ready = !!src;

  return (
    <div className={`audio-player ${ready ? "" : "audio-player-loading"}`}>
      <audio ref={audioRef} src={src ?? undefined} preload="metadata" />
      <button
        className="audio-play-btn"
        onClick={togglePlay}
        disabled={!ready}
        title={playing ? "Pause" : "Play"}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="audio-body">
        {title && <div className="audio-title nowrap">{title}</div>}
        <div className="audio-controls">
          <span className="audio-time">{formatTime(current)}</span>
          <input
            className="audio-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={onSeek}
            disabled={!ready}
            aria-label="Seek"
          />
          <span className="audio-time audio-time-total">{formatTime(duration)}</span>
          <input
            className="audio-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={onVolume}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
