// StickerPicker: a sticker selection panel showing all guild stickers.
// Clicking a sticker sends it as a message with `sticker_ids`.
// Source: reference/fluxer/fluxer_app/src/features/channel/components/pickers/
// (the expression picker panel structure, adapted for stickers).

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { api } from "../api";
import { guilds, messages, ui } from "../stores";
import type { Sticker, Snowflake } from "../types";
import "./StickerPicker.css";

export const StickerPicker = observer(function StickerPicker({
  channelId,
}: {
  channelId: Snowflake;
}) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);

  // Load stickers from the current guild.
  const guild = ui.currentGuild;
  useEffect(() => {
    if (!guild) {
      setStickers([]);
      setLoading(false);
      return;
    }
    // Fetch stickers from the API.
    setLoading(true);
    api.listGuildStickers(guild.id)
      .then((result) => { setStickers(result ?? []); })
      .catch(() => { setStickers([]); })
      .finally(() => setLoading(false));
  }, [guild?.id]);

  const sendSticker = (sticker: Sticker) => {
    messages.send(channelId, "", undefined, [], [sticker.id]).catch(() => {});
    ui.toggleEmojiPicker(false);
  };

  return (
    <div className="sticker-picker">
      <div className="sticker-picker-header">
        <span className="sticker-picker-title muted small">Stickers</span>
      </div>
      <div className="sticker-picker-grid">
        {loading && (
          <div className="sticker-picker-empty muted small">Loading stickers…</div>
        )}
        {!loading && stickers.length === 0 && (
          <div className="sticker-picker-empty muted small">
            No stickers in this server yet.
            {guild && (
              <>
                <br />Ask an admin to add stickers in{" "}
                <a
                  href={`https://fluxer.app/guilds/${guild.id}/stickers`}
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  Server Settings
                </a>.
              </>
            )}
          </div>
        )}
        {stickers.map((s) => (
          <button
            key={s.id}
            className="sticker-picker-item"
            onClick={() => sendSticker(s)}
            title={s.name}
          >
            <img
              src={stickerUrl(s)}
              alt={s.name}
              loading="lazy"
            />
            <span className="sticker-picker-name muted small">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

function stickerUrl(sticker: Sticker): string {
  const media = guilds.guilds.length ? (window as any).__endpoints?.media ?? "" : "";
  // Fluxer stickers are served from the media CDN as PNG/Lottie.
  // The asset field contains the sticker hash/filename.
  const ext = sticker.format_type === 2 ? "png" : sticker.format_type === 3 ? "lottie" : "png";
  return `${media}/stickers/${sticker.id}.${ext}`;
}