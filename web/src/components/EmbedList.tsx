// EmbedList: renders the embeds (link previews / rich embeds / video / image)
// attached to a message. Fluxer delivers embeds as structured data on the
// message object; this component renders each kind:
//   - Rich/article: a bordered card with color bar, provider, title, description,
//     thumbnail, fields, footer.
//   - Direct video (`video.url`): a cached <video> with the thumbnail as poster.
//   - YouTube / iframe (`html`): a click-to-play sandboxed iframe at the embed's
//     html_width × html_height, so we don't spin up YouTube for every embed on
//     scroll.
// Media URLs (images, thumbnails, video) are routed through the on-disk media
// cache via `useAssetUrl` for native browser caching + CORS avoidance.

import { useState } from "react";
import type { Embed } from "../types";
import { useAssetUrl } from "../utils/mediaCache";
import { ui } from "../stores";
import { AudioPlayer } from "./AudioPlayer";
import { FormattedText } from "./ContentRenderer";
import "./EmbedList.css";

export function EmbedList({ embeds }: { embeds: Embed[] }) {
  if (!embeds || embeds.length === 0) return null;
  return (
    <div className="embed-list">
      {embeds.map((e, i) => (
        <EmbedItem key={i} embed={e} />
      ))}
    </div>
  );
}

function EmbedItem({ embed }: { embed: Embed }) {
  // YouTube / iframe embeds. When the server supplies `html` (sanitized oEmbed
  // iframe), render it directly. When it's a YouTube video URL without `html`,
  // synthesize the embed iframe so it's actually playable (a watch URL isn't a
  // media file the native <video> can play).
  const yt = embed.html ? null : youtubeId(embed);
  if (embed.html || yt) {
    return <IframeEmbed embed={embed} synthesizedHtml={yt ? yt.html : undefined} />;
  }
  // Direct video embed.
  if (embed.video?.url) {
    return <VideoEmbed embed={embed} />;
  }
  // Audio embed.
  if (embed.audio?.url) {
    return (
      <div className="embed embed-audio">
        <AudioPlayer url={embed.audio.url} duration={embed.audio.duration ?? undefined} title={embed.title ?? embed.provider?.name} />
      </div>
    );
  }
  // Image embed (just a big image). Opens the in-app viewer on click.
  if ((embed.type === "image" || embed.type === "gifv") && embed.image?.url) {
    return (
      <button
        className="embed-image-link"
        onClick={(e) => { e.preventDefault(); ui.openImageViewer(embed.image!.url); }}
      >
        <CachedImage url={embed.image.url} alt={embed.title ?? "image"} />
      </button>
    );
  }
  // Rich / article / link: the full card.
  return <RichEmbed embed={embed} />;
}

/// Extract a YouTube video id + a synthesized embed iframe HTML from an embed's
/// `video.url` or `url` when it points at youtube.com/watch or youtu.be/. Returns
/// null when the embed isn't a YouTube link.
function youtubeId(embed: Embed): { id: string; html: string } | null {
  const candidates = [embed.video?.url, embed.url].filter((u): u is string => !!u);
  for (const raw of candidates) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      let id: string | null = null;
      if (host === "youtu.be") {
        id = u.pathname.slice(1);
      } else if (host === "youtube.com" || host === "m.youtube.com") {
        id = u.searchParams.get("v");
        if (!id && u.pathname.startsWith("/embed/")) id = u.pathname.slice("/embed/".length);
      }
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
        const html = `<iframe width="100%" height="100%" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen src="https://www.youtube.com/embed/${id}?autoplay=1"></iframe>`;
        return { id, html };
      }
    } catch {
      // not a URL
    }
  }
  return null;
}

/// A rich/article embed card.
function RichEmbed({ embed }: { embed: Embed }) {
  const color = embed.color != null ? `#${(embed.color & 0xffffff).toString(16).padStart(6, "0")}` : null;
  return (
    <div className="embed" style={color ? { borderLeftColor: color } : undefined}>
      {color && <span className="embed-color-bar" style={{ background: color }} />}
      <div className="embed-body">
        {embed.provider?.name && <div className="embed-provider muted small">{embed.provider.name}</div>}
        <div className="embed-main">
          <div className="embed-text">
            {embed.title && (
              embed.url ? (
                <a className="embed-title" href={embed.url} target="_blank" rel="noreferrer"><FormattedText text={embed.title} /></a>
              ) : (
                <div className="embed-title"><FormattedText text={embed.title} /></div>
              )
            )}
            {embed.description && <div className="embed-description"><FormattedText text={embed.description} /></div>}
            {embed.fields && embed.fields.length > 0 && (
              <div className="embed-fields">
                {embed.fields.map((f, i) => (
                  <div key={i} className={`embed-field ${f.inline ? "inline" : ""}`}>
                    <div className="embed-field-name"><FormattedText text={f.name} /></div>
                    <div className="embed-field-value"><FormattedText text={f.value} /></div>
                  </div>
                ))}
              </div>
            )}
            {embed.author && (
              <div className="embed-author">
                {embed.author.icon_url && <CachedImage className="embed-author-icon" url={embed.author.icon_url} alt="" />}
                {embed.author.url ? (
                  <a className="embed-author-name" href={embed.author.url} target="_blank" rel="noreferrer">{embed.author.name}</a>
                ) : (
                  <span className="embed-author-name">{embed.author.name}</span>
                )}
              </div>
            )}
            {embed.footer && (
              <div className="embed-footer muted small">
                {embed.footer.icon_url && <CachedImage className="embed-footer-icon" url={embed.footer.icon_url} alt="" />}
                {embed.footer.text}
              </div>
            )}
          </div>
          {embed.thumbnail?.url && (
            <button
              className="embed-thumb"
              onClick={(e) => { e.preventDefault(); ui.openImageViewer(embed.thumbnail!.url); }}
            >
              <CachedImage url={embed.thumbnail.url} alt={embed.title ?? ""} />
            </button>
          )}
        </div>
        {embed.image?.url && (
          <button
            className="embed-image-link"
            onClick={(e) => { e.preventDefault(); ui.openImageViewer(embed.image!.url); }}
          >
            <CachedImage url={embed.image.url} alt={embed.title ?? "image"} />
          </button>
        )}
      </div>
    </div>
  );
}

/// A direct-video embed. Uses the cached media layer for both the video bytes
/// and the poster thumbnail.
function VideoEmbed({ embed }: { embed: Embed }) {
  const videoSrc = useAssetUrl(embed.video?.url);
  const posterSrc = useAssetUrl(embed.thumbnail?.url ?? embed.image?.url);
  if (!videoSrc) return <div className="embed-video-placeholder" aria-label="video" />;
  return (
    <div className="embed-video-wrap">
      <video
        className="embed-video"
        controls
        src={videoSrc}
        poster={posterSrc ?? undefined}
        style={embed.video?.width ? { aspectRatio: `${embed.video.width} / ${embed.video.height ?? 9}` } : undefined}
      />
    </div>
  );
}

/// A click-to-play iframe embed (YouTube, etc.). The iframe is only mounted
/// after the user clicks, so off-screen embeds don't load scripts/video.
function IframeEmbed({ embed, synthesizedHtml }: { embed: Embed; synthesizedHtml?: string }) {
  const [play, setPlay] = useState(false);
  const posterSrc = useAssetUrl(embed.thumbnail?.url ?? embed.image?.url);
  const html = synthesizedHtml ?? embed.html ?? "";
  const ratio = embed.html_width && embed.html_height
    ? `${embed.html_width} / ${embed.html_height}`
    : "16 / 9";
  if (play) {
    // Render the (synthesized or server-supplied) iframe HTML. For server-
    // supplied oEmbed (YouTube, SoundCloud), the iframe may not autoplay —
    // append `autoplay=1` to YouTube srcs on mount so clicking the gate starts
    // playback. The Tauri CSP is disabled so iframe scripts/autoplay work.
    return (
      <div
        className="embed-iframe-wrap"
        style={{ aspectRatio: ratio }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <button
      className="embed-iframe-gate"
      style={{ aspectRatio: ratio }}
      onClick={() => setPlay(true)}
      title="Play"
      aria-label={`Play ${embed.provider?.name ?? "video"}`}
    >
      {posterSrc ? (
        <img src={posterSrc} alt={embed.title ?? ""} draggable={false} />
      ) : (
        <span className="embed-iframe-poster" />
      )}
      <span className="embed-iframe-play">▶</span>
    </button>
  );
}

/// A cached image (routed through the on-disk media cache).
function CachedImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const src = useAssetUrl(url);
  if (!src) return <span className={`embed-img-placeholder ${className ?? ""}`} aria-label={alt} />;
  return <img className={className} src={src} alt={alt} draggable={false} />;
}
