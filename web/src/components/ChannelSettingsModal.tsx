// ChannelSettingsModal: configure a guild channel's Overview settings —
// name, topic, slowmode (rate_limit_per_user), and NSFW flag.
//
// Replaces the crude window.prompt rename in ChannelList's context menu with a
// real settings surface, matching the reference client's channel Overview tab.
// Source (read-only parity ref, re-authored not copied):
//   reference/.../features/channel/components/modals/channel_tabs/channel_overview_tab/
//   (SlowmodeControl.tsx — preset list traced exactly; max 21600s per openapi).
//
// Wires two backend commands: edit_channel (name/topic) + set_channel_options
// (rate_limit_per_user/nsfw).

import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { useEffect, useState } from "react";
import { guilds, ui, toasts } from "../stores";
import { api } from "../api";
import { channelType } from "../types";
import type { Channel } from "../types";
import { Modal } from "./Modal";
import { Button } from "./Button";
import "./ChannelSettingsModal.css";

// Slowmode presets — values + labels traced 1:1 from the reference
// SlowmodeControl.tsx. Max (21600 = 6h) matches openapi rate_limit_per_user.
const SLOWMODE_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
  { value: 21600, label: "6 hours" },
];

// Text-like channels support slowmode + NSFW. Voice/category/link do not.
function supportsSlowmode(type: number): boolean {
  return type === channelType.GUILD_TEXT;
}

export const ChannelSettingsModal = observer(function ChannelSettingsModal() {
  const open = ui.channelSettingsOpen;
  const channelId = ui.channelSettingsChannelId;
  const found = channelId ? guilds.findChannel(channelId) : undefined;
  const channel = found?.channel;
  const guildId = found?.guildId;

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [slowmode, setSlowmode] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the form from the channel whenever the modal opens for a channel.
  useEffect(() => {
    if (open && channel) {
      setName(channel.name ?? "");
      setTopic(channel.topic ?? "");
      setSlowmode(channel.rate_limit_per_user ?? 0);
      setNsfw(channel.nsfw ?? false);
    }
  }, [open, channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !channel || !channelId || !guildId) return null;

  const isText = supportsSlowmode(channel.type);
  const trimmedName = name.trim();
  const nameChanged = trimmedName !== "" && trimmedName !== (channel.name ?? "");
  const topicChanged = topic !== (channel.topic ?? "");
  const slowmodeChanged = slowmode !== (channel.rate_limit_per_user ?? 0);
  const nsfwChanged = nsfw !== (channel.nsfw ?? false);
  const dirty = nameChanged || topicChanged || (isText && (slowmodeChanged || nsfwChanged));

  const applyUpdate = (updated: Channel) => {
    runInAction(() => {
      const chs = guilds.channelsByGuild.get(guildId) ?? [];
      const idx = chs.findIndex((c) => c.id === channelId);
      if (idx >= 0) {
        const next = [...chs];
        // Merge: set_channel_options and edit_channel each return the full
        // channel, but merging guards against either returning a partial.
        next[idx] = { ...next[idx], ...updated };
        guilds.channelsByGuild.set(guildId, next);
      }
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (nameChanged || topicChanged) {
        const updated = await api.editChannel(
          channelId,
          nameChanged ? trimmedName : undefined,
          topicChanged ? topic : undefined,
        );
        applyUpdate(updated);
      }
      if (isText && (slowmodeChanged || nsfwChanged)) {
        const updated = await api.setChannelOptions(
          channelId,
          slowmodeChanged ? slowmode : undefined,
          nsfwChanged ? nsfw : undefined,
        );
        applyUpdate(updated);
      }
      ui.closeChannelSettings();
    } catch (err) {
      toasts.error("Failed to save channel settings", String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => ui.closeChannelSettings()}
      title={`#${channel.name ?? "channel"} — Settings`}
      size="medium"
      footer={
        <>
          <Button variant="secondary" onClick={() => ui.closeChannelSettings()} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </>
      }
    >
      <div className="channel-settings-form">
        <label className="channel-settings-field">
          <span className="channel-settings-label">Channel Name</span>
          <input
            className="channel-settings-input"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {isText && (
          <label className="channel-settings-field">
            <span className="channel-settings-label">Channel Topic</span>
            <textarea
              className="channel-settings-input channel-settings-textarea"
              value={topic}
              rows={3}
              maxLength={1024}
              placeholder="Let everyone know how to use this channel"
              onChange={(e) => setTopic(e.target.value)}
            />
          </label>
        )}

        {isText && (
          <label className="channel-settings-field">
            <span className="channel-settings-label">Slowmode</span>
            <select
              className="channel-settings-input"
              value={slowmode}
              onChange={(e) => setSlowmode(Number(e.target.value))}
            >
              {SLOWMODE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="channel-settings-hint">
              Members will be able to send one message per this interval.
            </span>
          </label>
        )}

        {isText && (
          <label className="channel-settings-field channel-settings-toggle">
            <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
            <span>
              <span className="channel-settings-label">Age-Restricted Channel (NSFW)</span>
              <span className="channel-settings-hint">
                Users must confirm they are of age before viewing.
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
});
