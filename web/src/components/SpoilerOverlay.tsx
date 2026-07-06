// SpoilerOverlay: hides media/embeds behind a translucent overlay with a
// centered "SPOILER" pill. While hidden the wrapped content keeps its layout
// size but is invisible and inert (visibility:hidden + pointer-events:none),
// so e.g. the image-viewer click can't fire until revealed.

import "./SpoilerOverlay.css";

export function SpoilerOverlay({
  hidden,
  onReveal,
  inline,
  className,
  children,
}: {
  hidden: boolean;
  onReveal: () => void;
  /** Inline-block container (for inline media like file chips). */
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "spoiler-overlay" +
        (hidden ? " hidden" : "") +
        (inline ? " inline" : "") +
        (className ? ` ${className}` : "")
      }
    >
      <div className="spoiler-overlay-content" aria-hidden={hidden || undefined}>
        {children}
      </div>
      {hidden && (
        <button className="spoiler-overlay-btn" aria-label="Reveal spoiler" onClick={onReveal}>
          <span className="spoiler-overlay-label">Spoiler</span>
        </button>
      )}
    </div>
  );
}
