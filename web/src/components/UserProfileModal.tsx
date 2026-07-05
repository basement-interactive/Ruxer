// UserProfileModal: a full profile modal showing the user's banner, avatar,
// name, tag, bio, roles, and action buttons (Message, Add Friend, etc).
// Replaces the small popup with a rich card matching the real Fluxer client's
// ProfileCard anatomy.
//
// Source: reference/fluxer/fluxer_app/src/features/user/components/profile/profile_card/
// (ProfileCardLayout, ProfileCardBanner, ProfileCardContent, ProfileCardUserInfo, ProfileCardActions, ProfileCardFooter)

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { ui, guilds, relationships, openDmWithUser, session } from "../stores";
import type { User } from "../types";
import { api } from "../api";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import "./UserProfileModal.css";

export const UserProfileModal = observer(function UserProfileModal() {
  const userId = ui.profileUserId;
  const known = userId ? ui.knownUsers.get(userId) : undefined;

  const [user, setUser] = useState<User | undefined>(known);
  const [bio, setBio] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setUser(undefined);
      setBio(null);
      setBanner(null);
      return;
    }
    const cached = ui.knownUsers.get(userId);
    if (cached) {
      setUser(cached);
    } else {
      api.getUser(userId).then((u) => {
        setUser(u);
      }).catch(() => {});
    }
  }, [userId]);

  if (!userId) return null;

  const name = user?.global_name ?? user?.username ?? "Loading…";
  const tag = user ? `${user.username}` : "";
  const isMe = session.meId === userId;
  const rel = relationships.getRelationship(userId);

  // Guild member info — resolved against the guild the profile was opened in
  // (not the last-selected guild), so roles are correct from DMs/messages/voice.
  const guildId = ui.profileGuildId;
  const guild = guildId ? guilds.getGuild(guildId) : undefined;
  const member = guildId ? guilds.getMember(guildId, userId) : undefined;
  const roles = guild
    ? (member?.roles ?? [])
        // @everyone has id === guildId; exclude it from the pill list.
        .map((rid) => guild.roles.find((r) => r.id === rid))
        .filter((r): r is NonNullable<typeof r> => !!r && r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
    : [];

  return (
    <div className="profile-modal-overlay" onClick={() => ui.closeProfile()}>
      <div className="profile-card" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div className="profile-card-banner-area">
          {banner && (
            <img className="profile-card-banner" src={banner} alt="" />
          )}
          {/* Avatar — positioned overlapping the banner */}
          <div className="profile-card-avatar">
            <Avatar user={user ?? { id: userId, username: "", discriminator: "0" }} size={80} />
          </div>
        </div>

        {/* User info */}
        <div className="profile-card-content">
          <div className="profile-card-name-row">
            <span className="profile-card-name">{member?.nick ?? name}</span>
            {user?.bot && <span className="profile-card-bot-badge">BOT</span>}
          </div>
          {tag && <div className="profile-card-username">{tag}</div>}

          {/* Bio */}
          {bio && (
            <div className="profile-card-bio-section">
              <div className="profile-card-section-title">About Me</div>
              <div className="profile-card-bio">{bio}</div>
            </div>
          )}

          {/* Roles */}
          {roles.length > 0 && (
            <div className="profile-card-roles-section">
              <div className="profile-card-section-title">Roles</div>
              <div className="profile-card-roles">
                {roles.map((r) => (
                  <span key={r.id} className="profile-card-role">
                    <span className="profile-card-role-dot" style={{ background: roleDotColor(r.color) }} />
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Member since */}
          {member?.joined_at && (
            <div className="profile-card-member-since">
              <span className="profile-card-section-title">Member Since</span>
              <span className="profile-card-member-date">{new Date(member.joined_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="profile-card-actions">
          {!isMe && (
            <Button
              variant="secondary"
              small
              onClick={() => {
                openDmWithUser(userId).then((ch) => {
                  ui.openChannel(ch.id);
                  ui.closeProfile();
                });
              }}
            >
              Message
            </Button>
          )}
          {!isMe && !user?.bot && !rel && (
            <Button
              variant="primary"
              small
              onClick={() => {
                relationships.sendFriendRequest(userId).catch(() => {});
              }}
            >
              Add Friend
            </Button>
          )}
          {!isMe && rel?.type === 1 && (
            <Button
              variant="danger"
              small
              onClick={() => {
                relationships.remove(userId).catch(() => {});
              }}
            >
              Remove Friend
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
// Resolve a role's integer color to a CSS rgb() string. Color 0 (no color)
// renders the neutral default gray, matching the real client.
function roleDotColor(color: number): string {
  if (!color) return "rgb(219, 222, 225)";
  return `rgb(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff})`;
}
