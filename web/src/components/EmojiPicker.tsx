// EmojiPicker: a popover panel with a search bar, category tabs, a grid of
// unicode emoji, and a section for custom guild emoji. Clicking an emoji calls
// onPick with the unicode char (or `:name:` for custom emoji).

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { guilds, ui } from "../stores";
import { EMOJI_TABLE, searchShortcodes } from "../emoji-data";
import { emojiUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import { StickerPicker } from "./StickerPicker";
import "./EmojiPicker.css";

export const EmojiPicker = observer(function EmojiPicker({
  onPick,
}: {
  onPick: (char: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"emoji" | "stickers">("emoji");
  const custom = guilds.allCustomEmoji;
  const filtered = query
    ? searchShortcodes(query, 200)
    : EMOJI_TABLE.map((e) => [e[0], e[1]] as [string, string]);

  return (
    <div className="emoji-picker">
      {tab === "emoji" ? (
        <>
      <div className="emoji-picker-search">
        <SearchIcon />
        <input
          placeholder="Search emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="emoji-picker-scroll">
        {/* Custom guild emoji section */}
        {!query && custom.length > 0 && (
          <div className="emoji-section">
            <div className="emoji-section-title">Custom Emoji</div>
            <div className="emoji-grid">
              {custom.map((e) => (
                <CustomEmojiCell
                  key={e.id}
                  emoji={e}
                  onPick={() => onPick(`:${e.name}:`)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="emoji-section">
          <div className="emoji-section-title">Emoji</div>
          <div className="emoji-grid">
            {filtered.map(([code, char]) => (
              <button
                key={code}
                className="emoji-cell"
                title={`:${code}:`}
                onClick={() => onPick(char)}
              >
                {char}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="emoji-empty muted">No emoji found.</div>
            )}
          </div>
        </div>
      </div>
        </>
      ) : (
        <StickerPicker channelId={ui.selectedChannelId ?? ""} />
      )}
      <div className="emoji-picker-tabs">
        <button className={`emoji-picker-tab ${tab === "emoji" ? "active" : ""}`} onClick={() => setTab("emoji")} title="Emoji">
          <EmojiTabIcon />
        </button>
        <button className={`emoji-picker-tab ${tab === "stickers" ? "active" : ""}`} onClick={() => setTab("stickers")} title="Stickers">
          <StickerTabIcon />
        </button>
      </div>
      <button className="emoji-picker-close" onClick={() => ui.toggleEmojiPicker(false)}>
        ✕
      </button>
    </div>
  );
});

const CustomEmojiCell = ({ emoji, onPick }: { emoji: { id: string; name: string; animated?: boolean }; onPick: () => void }) => {
  const url = emojiUrl(emoji.id, !!emoji.animated);
  const src = useAssetUrl(url);
  return (
    <button className="emoji-cell custom" title={`:${emoji.name}:`} onClick={onPick}>
      {src ? <img src={src} width={24} height={24} alt={emoji.name} draggable={false} /> : `:${emoji.name}:`}
    </button>
  );
};

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EmojiTabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7.5 3.5c.83 1.2 2.23 2 4 2s3.17-.8 4-2c.28-.4.04-.93-.42-1.05A8.5 8.5 0 0 0 12 15a8.5 8.5 0 0 0-3.58-.55c-.46.12-.7.65-.42 1.05z" />
    </svg>
  );
}

function StickerTabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6z" />
      <path d="M21 12h-6v9" />
      <path d="M9 9h6" />
    </svg>
  );
}