// PinsPane: the right-side panel listing pinned messages for the current
// channel. Loads on open; refetches when CHANNEL_PINS_UPDATE arrives.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { ui, messages } from "../stores";
import { Avatar } from "../components/Avatar";
import { shortTime } from "../utils";
import "./PinsPane.css";

export const PinsPane = observer(function PinsPane() {
  const channelId = ui.selectedChannelId;
  if (!channelId) return null;
  const pins = messages.getPins(channelId);

  useEffect(() => {
    if (channelId && messages.pinsByChannel.has(channelId) === false) {
      messages.loadPins(channelId);
    }
  }, [channelId]);

  return (
    <aside className="pins-pane">
      <div className="pins-pane-header">
        <span>Pinned messages</span>
        <button className="pins-close" onClick={() => ui.rightPane = "none"}>
          ✕
        </button>
      </div>
      <div className="pins-pane-scroll">
        {pins.length === 0 && (
          <div className="pins-empty muted">
            {messages.pinsByChannel.has(channelId) ? "No pinned messages." : "Loading pins…"}
          </div>
        )}
        {pins.map((m) => (
          <div key={m.id} className="pin-item">
            <div className="pin-item-header">
              <Avatar user={m.author} size={20} />
              <span className="pin-item-author">{m.author.global_name ?? m.author.username}</span>
              <span className="pin-item-time muted small">{shortTime(m.timestamp)}</span>
            </div>
            <div className="pin-item-content">{m.content}</div>
          </div>
        ))}
      </div>
    </aside>
  );
});