// ImageViewer: a full-screen lightbox for image attachments / embed images.
// Replaces navigating to the image URL (which opened it externally) with an
// in-app viewer that shows the full-size image over a dark backdrop, closes on
// Escape / backdrop click, and supports zoom-to-fit / actual-size toggle.
//
// The image source is resolved through the on-disk media cache (`useAssetUrl`)
// so the bytes are already warm if the image was rendered inline, and cached
// for next time.

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { ui } from "../stores";
import { useAssetUrl } from "../utils/mediaCache";
import "./ImageViewer.css";

export const ImageViewer = observer(function ImageViewer() {
  const url = ui.imageViewerUrl;
  const [zoomed, setZoomed] = useState(false);

  // Reset zoom whenever a new image opens.
  useEffect(() => {
    if (url) setZoomed(false);
  }, [url]);

  // Close on Escape.
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeImageViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url]);

  if (!url) return null;

  return (
    <div
      className="image-viewer-overlay"
      onClick={() => ui.closeImageViewer()}
      role="dialog"
      aria-modal="true"
    >
      <button
        className="image-viewer-close"
        onClick={(e) => { e.stopPropagation(); ui.closeImageViewer(); }}
        title="Close (Esc)"
        aria-label="Close"
      >
        ✕
      </button>
      <ImageViewerImage url={url} zoomed={zoomed} onToggle={() => setZoomed((z) => !z)} />
    </div>
  );
});

function ImageViewerImage({ url, zoomed, onToggle }: { url: string; zoomed: boolean; onToggle: () => void }) {
  const src = useAssetUrl(url);
  return (
    <img
      className={`image-viewer-img ${zoomed ? "zoomed" : "fit"}`}
      src={src ?? undefined}
      alt=""
      draggable={false}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={zoomed ? "Click to fit" : "Click for actual size"}
    />
  );
}
