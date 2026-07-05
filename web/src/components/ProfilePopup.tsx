// ProfilePopup: a floating card showing a user's profile. Anchored to the click
// position. Shows avatar, name, tag, bot badge, roles (if guild member), and a
// Message button to open a DM.

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { ui, guilds, openDmWithUser } from "../stores";
import type { User } from "../types";
import { api } from "../api";
import { Avatar } from "./Avatar";
import "./ProfilePopup.css";

export const ProfilePopup = observer(function ProfilePopup() {
  const userId = ui.profileUserId;
  const pos = ui.profilePos;
  const known = userId ? ui.knownUsers.get(userId) : undefined;

  // Fetch the user if not cached.
  const [user, setUser] = useState<User | undefined>(known);
  useEffect(() => {
    if (!userId) {
      setUser(undefined);
      return;
    }
    const cached = ui.knownUsers.get(userId);
    if (cached) {
      setUser(cached);
    } else {
      api.getUser(userId).then((u) => setUser(u)).catch(() => {});
    }
  }, [userId]);

  // Close on Escape or outside click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeProfile();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!userId || !pos) return null;

  const name = user?.global_name ?? user?.username ?? "Loading…";
  const tag = user ? `${user.username}#${user.discriminator}` : "";

  // Guild member info (nick + roles) if we're in a guild.
  const guild = ui.currentGuild;
  let member: { nick?: string | null; roles: string[] } | undefined;
  if (guild) {
    const members = guilds.membersByGuild.get(guild.id);
    member = members?.find((m) => m.user.id === userId);
  }
  const roles = guild
    ? (member?.roles ?? [])
        .map((rid) => guild.roles.find((r) => r.id === rid))
        .filter((r): r is NonNullable<typeof r> => !!r && r.name !== "@everyone")
    : [];

  return (
    <div className="profile-popup-overlay" onClick={() => ui.closeProfile()}>
      <div
        className="profile-popup"
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-popup-header">
          <Avatar user={user ?? { id: userId, username: "", discriminator: "" }} size={80} />
          <div className="profile-popup-name-wrap">
            <div className="profile-popup-name">{name}</div>
            {tag && <div className="profile-popup-tag muted">{tag}</div>}
            {user?.bot && <span className="bot-badge">BOT</span>}
          </div>
        </div>
        {member?.nick && (
          <div className="profile-popup-row">
            <span className="muted small">Nick</span>
            <span>{member.nick}</span>
          </div>
        )}
        {roles.length > 0 && (
          <div className="profile-popup-row col">
            <span className="muted small">Roles</span>
            <div className="profile-popup-roles">
              {roles.map((r) => (
                <span key={r.id} className="role-pill">
                  {r.color !== 0 && (
                    <span
                      className="role-dot"
                      style={{ background: intToHex(r.color) }}
                    />
                  )}
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="profile-popup-actions">
          <button
            className="profile-popup-message"
            onClick={() => {
              openDmWithUser(userId).then((ch) => {
                ui.openChannel(ch.id);
                ui.closeProfile();
              });
            }}
          >
            Message
          </button>
          <button className="profile-popup-close" onClick={() => ui.closeProfile()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

function intToHex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}