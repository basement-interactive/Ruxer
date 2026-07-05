// GifPicker: a GIF search panel triggered from the composer's expression picker.
// Uses the Fluxer REST API's GIF endpoints (proxied to the Klipy GIF provider).
// Source: reference/fluxer/fluxer_app/src/features/channel/components/pickers/gif/
// (GifPicker, GifPickerGrid, GifPickerGridItem, GifPickerHeader, GifPickerView).

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { GifResult } from "../types";
import "./GifPicker.css";

export const GifPicker = observer(function GifPicker({
  onPick,
}: {
  onPick: (gif: GifResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"trending" | "search">("trending");
  const debounceRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load trending GIFs on mount.
  useEffect(() => {
    setLoading(true);
    api.gifTrending()
      .then((results) => { setGifs(results); setMode("trending"); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced search when the query changes.
  useEffect(() => {
    if (!query.trim()) {
      // Empty query → back to trending.
      if (mode !== "trending") {
        setLoading(true);
        api.gifTrending()
          .then((results) => { setGifs(results); setMode("trending"); })
          .catch(() => {})
          .finally(() => setLoading(false));
      }
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setLoading(true);
      api.gifSearch(query)
        .then((results) => { setGifs(results); setMode("search"); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="gif-picker">
      <div className="gif-picker-header">
        <input
          className="gif-picker-search"
          placeholder="Search GIFs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="gif-picker-grid" ref={scrollRef}>
        {loading && (
          <div className="gif-picker-loading muted small">Loading GIFs…</div>
        )}
        {!loading && gifs.length === 0 && (
          <div className="gif-picker-empty muted small">No GIFs found.</div>
        )}
        {gifs.map((gif) => (
          <button
            key={gif.id}
            className="gif-picker-item"
            onClick={() => onPick(gif)}
            title={gif.title}
          >
            <img
              src={gif.proxy_src || gif.src}
              alt={gif.title}
              loading="lazy"
              style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
            />
          </button>
        ))}
      </div>
    </div>
  );
});