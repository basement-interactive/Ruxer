// InviteEmbed: a custom joinable embed rendered inline when a message contains
// a Fluxer invite URL (fluxer.gg/{code} or fluxer.app/invite/{code}). Lazily
// fetches the invite preview via `api.fetchInvite` and renders the guild icon,
// name, member count, and a Join button that calls `api.acceptInvite` (then
// switches to the joined guild, mirroring CreateJoinGuildModal).

import { useEffect, useState } from "react";
import { api } from "../api";
import { session as session_store, guilds, ui, toasts } from "../stores";
import type { Invite } from "../types";
import { useAssetUrl } from "../utils/mediaCache";
import "./InviteEmbed.css";

export function InviteEmbed({ code }: { code: string; url?: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInvite(null);
    setError(null);
    api.fetchInvite(code)
      .then((inv) => { if (!cancelled) setInvite(inv); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [code]);

  const join = async () => {
    setJoining(true);
    try {
      const res = await api.acceptInvite(code);
      // Switch to the joined guild when the result carries one.
      const gid = res.kind === "Guild" ? res.guild.id : res.kind === "Channel" ? res.channel.guild_id ?? null : null;
      if (gid) {
        const idx = guilds.guilds.findIndex((g) => g.id === gid);
        if (idx >= 0) ui.selectGuild(idx);
      }
    } catch (e) {
      toasts.error("Failed to join", String(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="invite-embed">
      {error && <div className="invite-embed-error muted small">Couldn’t load invite: {error}</div>}
      {!invite && !error && <div className="invite-embed-loading muted small">Loading invite…</div>}
      {invite && (
        <>
          {invite.revoked && <div className="invite-embed-revoked">This invite has been revoked or expired.</div>}
          <div className="invite-embed-body">
            <InviteGuildIcon invite={invite} />
            <div className="invite-embed-info">
              <div className="invite-embed-name nowrap">{invite.guild?.name ?? "Unknown server"}</div>
              <div className="invite-embed-meta muted small">
                {invite.approximate_member_count != null && `${invite.approximate_member_count.toLocaleString()} members`}
                {invite.approximate_presence_count != null && ` • ${invite.approximate_presence_count.toLocaleString()} online`}
                {invite.channel?.name && ` • #${invite.channel.name}`}
              </div>
            </div>
            <button
              className="invite-embed-join"
              disabled={joining || !!invite.revoked}
              onClick={join}
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InviteGuildIcon({ invite }: { invite: Invite }) {
  const media = session_store.endpoints?.media ?? "";
  const url = invite.guild?.icon
    ? `${media}/icons/${invite.guild.id}/${invite.guild.icon}.webp?size=128`
    : null;
  const src = useAssetUrl(url);
  const initial = Array.from(invite.guild?.name?.trim() || "?")[0] ?? "?";
  if (src) return <img className="invite-embed-icon" src={src} alt="" draggable={false} />;
  return <div className="invite-embed-icon invite-embed-icon-fallback">{initial.toUpperCase()}</div>;
}