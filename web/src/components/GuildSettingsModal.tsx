// GuildSettingsModal: a modal for configuring a guild. Panes:
//   - Overview: guild name/icon (display only + delete guild for owner).
//   - Members: list members with kick action.
//   - Bans: list bans with unban action.
//   - Invites: list + create invites for the guild's first channel.
//   - Roles / Emoji / Audit / Webhooks: stubbed as "coming soon".
// Opened from the guild context menu or the channel header settings button.

import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import React, { useEffect, useRef, useState } from "react";
import { guilds, ui, toasts, session } from "../stores";
import { api } from "../api";
import type { AuditLog, GuildBan, Invite, Role, Snowflake, Sticker, User, Webhook } from "../types";
import { channelType } from "../types";
import { GuildIcon } from "./GuildIcon";
import {
  PERMISSION_FLAGS,
  parsePermissions,
  permissionsToString,
  hasPermission,
  togglePermission,
} from "../utils/permissions";
import "./GuildSettingsModal.css";

type Pane =
  | "overview"
  | "members"
  | "bans"
  | "invites"
  | "roles"
  | "emoji"
  | "stickers"
  | "audit"
  | "webhooks";

const NAV: { id: Pane; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "bans", label: "Bans" },
  { id: "invites", label: "Invites" },
  { id: "roles", label: "Roles" },
  { id: "emoji", label: "Emoji" },
  { id: "stickers", label: "Stickers" },
  { id: "audit", label: "Audit Log" },
  { id: "webhooks", label: "Webhooks" },
];

export const GuildSettingsModal = observer(function GuildSettingsModal() {
  const open = ui.guildSettingsOpen;
  const guildId = ui.guildSettingsGuildId;
  const [pane, setPane] = useState<Pane>("overview");

  useEffect(() => {
    if (open) setPane("overview");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeGuildSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !guildId) return null;
  const guild = guilds.guilds.find((g) => g.id === guildId);
  if (!guild) return null;

  return (
    <div className="gs-overlay" onClick={() => ui.closeGuildSettings()}>
      <div className="gs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gs-nav">
          <div className="gs-nav-header">{guild.name}</div>
          <div className="gs-nav-scroll">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`gs-nav-item ${pane === n.id ? "selected" : ""}`}
                onClick={() => setPane(n.id)}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-content">
          <button className="gs-close" title="Close" onClick={() => ui.closeGuildSettings()}>
            ✕
          </button>
          <div className="gs-pane">
            {pane === "overview" && <OverviewPane guildId={guildId} />}
            {pane === "members" && <MembersPane guildId={guildId} />}
            {pane === "bans" && <BansPane guildId={guildId} />}
            {pane === "invites" && <InvitesPane guildId={guildId} />}
            {pane === "roles" && <RolesPane guildId={guildId} />}
            {pane === "emoji" && <EmojiPane guildId={guildId} />}
            {pane === "stickers" && <StickersPane guildId={guildId} />}
            {pane === "audit" && <AuditPane guildId={guildId} />}
            {pane === "webhooks" && <WebhooksPane guildId={guildId} />}
          </div>
        </div>
      </div>
    </div>
  );
});

const OverviewPane = observer(function OverviewPane({ guildId }: { guildId: Snowflake }) {
  const g = guilds.guilds.find((x) => x.id === guildId)!;
  const [confirming, setConfirming] = useState(false);
  const isOwner = g.owner_id === session.meId;

  const del = async () => {
    try {
      await api.deleteGuild(guildId);
      runInAction(() => {
        guilds.guilds = guilds.guilds.filter((x) => x.id !== guildId);
      });
      ui.selectDm();
      ui.closeGuildSettings();
      toasts.success(`Deleted "${g.name}"`);
    } catch (e) {
      toasts.error("Failed to delete server", String(e));
    }
  };

  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Server Overview</h2>
      <div className="gs-overview-card">
        <GuildIcon guild={g} size={80} />
        <div className="gs-overview-info">
          <div className="gs-overview-name">{g.name}</div>
          <div className="gs-overview-meta muted small">
            {(guilds.membersByGuild.get(guildId)?.length ?? 0)} members
          </div>
        </div>
      </div>
      <p className="gs-pane-help muted small">
        Editing the server name + icon requires the upcoming roles/permissions
        REST endpoints. For now, manage these on fluxer.app.
      </p>
      {isOwner && (
        <div className="gs-danger-zone">
          <div className="gs-danger-title">Danger Zone</div>
          <button className="gs-danger-btn" onClick={() => setConfirming(true)}>
            Delete Server
          </button>
          {confirming && (
            <div className="gs-confirm">
              <span>Type the server name to confirm deletion:</span>
              <ConfirmDelete name={g.name} onConfirm={del} onCancel={() => setConfirming(false)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
});

function ConfirmDelete({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="gs-confirm-row">
      <input className="gs-input" value={v} onChange={(e) => setV(e.target.value)} placeholder={name} autoFocus />
      <button className="gs-danger-btn" disabled={v !== name} onClick={onConfirm}>Delete</button>
      <button className="gs-cancel-btn" onClick={onCancel}>Cancel</button>
    </div>
  );
}

const MembersPane = observer(function MembersPane({ guildId }: { guildId: Snowflake }) {
  const members = guilds.membersByGuild.get(guildId) ?? [];
  const [q, setQ] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Snowflake | null>(null);

  useEffect(() => {
    api
      .listGuildRoles(guildId)
      .then((list) => setRoles([...list].sort((a, b) => b.position - a.position)))
      .catch(() => {});
  }, [guildId]);

  const filtered = q.trim()
    ? members.filter((m) =>
        (m.user.global_name ?? m.user.username).toLowerCase().includes(q.trim().toLowerCase()),
      )
    : members;

  const setMemberRole = async (userId: Snowflake, roleId: Snowflake, on: boolean) => {
    try {
      if (on) await api.addMemberRole(guildId, userId, roleId);
      else await api.removeMemberRole(guildId, userId, roleId);
      runInAction(() => {
        const list = guilds.membersByGuild.get(guildId) ?? [];
        const m = list.find((x) => x.user.id === userId);
        if (m) {
          m.roles = on
            ? [...new Set([...m.roles, roleId])]
            : m.roles.filter((r) => r !== roleId);
          guilds.membersByGuild.set(guildId, [...list]);
        }
      });
    } catch (e) {
      toasts.error("Failed to update roles", String(e));
    }
  };

  // Roles assignable via the picker (exclude @everyone, which is the role whose
  // id equals the guild id).
  const assignable = roles.filter((r) => r.id !== guildId);

  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Members — {members.length}</h2>
      <input className="gs-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" />
      <div className="gs-list">
        {filtered.map((m) => (
          <div key={m.user.id} className="gs-member-row">
            <div className="gs-list-row">
              <span className="gs-list-name nowrap">{m.user.global_name ?? m.user.username}</span>
              <span className="gs-member-rolecount muted small">
                {m.roles.filter((r) => r !== guildId).length} roles
              </span>
              <button
                className="gs-list-action"
                title="Manage roles"
                onClick={() => setEditing(editing === m.user.id ? null : m.user.id)}
              >
                Roles
              </button>
              <button
                className="gs-list-action"
                title="Kick"
                onClick={async () => {
                  try {
                    await api.kickMember(guildId, m.user.id);
                    runInAction(() => {
                      const list = guilds.membersByGuild.get(guildId) ?? [];
                      guilds.membersByGuild.set(guildId, list.filter((x) => x.user.id !== m.user.id));
                    });
                    toasts.success(`Kicked ${m.user.username}`);
                  } catch (e) {
                    toasts.error("Failed to kick member", String(e));
                  }
                }}
              >
                Kick
              </button>
            </div>
            {editing === m.user.id && (
              <div className="gs-member-roles">
                {assignable.length === 0 && (
                  <span className="muted small">No assignable roles.</span>
                )}
                {assignable.map((r) => {
                  const has = m.roles.includes(r.id);
                  const hex = roleColor(r.color);
                  return (
                    <label key={r.id} className="gs-member-role-chip">
                      <input
                        type="checkbox"
                        checked={has}
                        onChange={(e) => setMemberRole(m.user.id, r.id, e.target.checked)}
                      />
                      <span
                        className="gs-role-dot"
                        style={{ background: hex ?? "var(--text-muted)" }}
                      />
                      <span className="nowrap" style={hex ? { color: hex } : undefined}>
                        {r.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="gs-empty muted">No members found.</div>}
      </div>
    </section>
  );
});

const BansPane = observer(function BansPane({ guildId }: { guildId: Snowflake }) {
  const bans = guilds.bansByGuild.get(guildId) ?? [];
  useEffect(() => {
    // Refresh from the server when the pane opens.
    api.listGuildBans(guildId).then((list: GuildBan[]) =>
      runInAction(() => guilds.bansByGuild.set(guildId, list)),
    ).catch((e) => toasts.warn("Failed to load bans", String(e)));
  }, [guildId]);
  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Bans — {bans.length}</h2>
      <div className="gs-list">
        {bans.map((b) => (
          <div key={b.user.id} className="gs-list-row">
            <span className="gs-list-name nowrap">{b.user.global_name ?? b.user.username}</span>
            {b.reason && <span className="gs-list-reason muted small nowrap">{b.reason}</span>}
            <button
              className="gs-list-action"
              title="Revoke ban"
              onClick={async () => {
                try {
                  await api.unbanUser(guildId, b.user.id);
                  runInAction(() => {
                    const list = guilds.bansByGuild.get(guildId) ?? [];
                    guilds.bansByGuild.set(guildId, list.filter((x) => x.user.id !== b.user.id));
                  });
                  toasts.success(`Unbanned ${b.user.username}`);
                } catch (e) {
                  toasts.error("Failed to unban", String(e));
                }
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        {bans.length === 0 && <div className="gs-empty muted">No bans recorded.</div>}
      </div>
    </section>
  );
});

const InvitesPane = observer(function InvitesPane({ guildId }: { guildId: Snowflake }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const chs = guilds.channelsByGuild.get(guildId) ?? [];
  const firstText = chs.find((c) => c.type === channelType.GUILD_TEXT);

  const refresh = async () => {
    if (!firstText) return;
    try {
      const list = await api.listChannelInvites(firstText.id);
      setInvites(list);
    } catch (e) {
      toasts.warn("Failed to load invites", String(e));
    }
  };
  useEffect(() => {
    refresh();
  }, [guildId]);

  const create = async () => {
    if (!firstText) {
      toasts.warn("No text channel to create an invite for.");
      return;
    }
    setBusy(true);
    try {
      await api.createChannelInvite(firstText.id, 0, 0);
      await refresh();
      toasts.success("Invite created");
    } catch (e) {
      toasts.error("Failed to create invite", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Invites</h2>
      <p className="gs-pane-help muted small">
        Invites are listed for the first text channel. Per-channel invites land
        with the full channel-settings UI.
      </p>
      <button className="gs-submit" onClick={create} disabled={busy || !firstText}>
        {busy ? "Creating…" : "Create Invite"}
      </button>
      <div className="gs-list">
        {invites.map((inv) => (
          <div key={inv.code} className="gs-list-row">
            <span className="gs-list-name mono streamer-hide">fluxer.app/invite/{inv.code}</span>
            {inv.uses != null && <span className="gs-list-reason muted small">{inv.uses} uses</span>}
            <button
              className="gs-list-action"
              title="Revoke"
              onClick={async () => {
                try {
                  await api.revokeInvite(inv.code);
                  setInvites(invites.filter((x) => x.code !== inv.code));
                  toasts.success("Invite revoked");
                } catch (e) {
                  toasts.error("Failed to revoke invite", String(e));
                }
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        {invites.length === 0 && <div className="gs-empty muted">No invites yet.</div>}
      </div>
    </section>
  );
});

// Convert a Fluxer integer color (0 = no color) to a CSS hex string.
function roleColor(color: number): string | null {
  if (!color) return null;
  return "#" + color.toString(16).padStart(6, "0");
}

function hexToColorInt(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? parseInt(m[1], 16) : 0;
}

const RolesPane = observer(function RolesPane({ guildId }: { guildId: Snowflake }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Snowflake | null>(null);

  const reload = () => {
    setErr(null);
    return api
      .listGuildRoles(guildId)
      .then((list) => setRoles([...list].sort((a, b) => b.position - a.position)))
      .catch((e) => setErr(String(e)));
  };
  useEffect(() => {
    let alive = true;
    api
      .listGuildRoles(guildId)
      .then((list) => alive && setRoles([...list].sort((a, b) => b.position - a.position)))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [guildId]);

  const createRole = async () => {
    try {
      const r = await api.createGuildRole(guildId, "new role");
      await reload();
      setSelected(r.id);
      toasts.success("Role created");
    } catch (e) {
      toasts.error("Failed to create role", String(e));
    }
  };

  const active = roles?.find((r) => r.id === selected) ?? null;

  return (
    <section className="gs-pane-section gs-roles">
      <div className="gs-roles-header">
        <h2 className="gs-pane-title">Roles{roles ? ` — ${roles.length}` : ""}</h2>
        <button className="gs-submit" onClick={createRole}>
          Create Role
        </button>
      </div>
      {err && <p className="gs-pane-help muted small">Failed to load roles: {err}</p>}
      {!roles && !err && <div className="gs-empty muted">Loading…</div>}
      <div className="gs-roles-split">
        <div className="gs-roles-list">
          {roles?.map((r) => {
            const hex = roleColor(r.color);
            return (
              <button
                key={r.id}
                className={`gs-role-item ${selected === r.id ? "selected" : ""}`}
                onClick={() => setSelected(r.id)}
              >
                <span
                  className="gs-role-dot"
                  style={{ background: hex ?? "var(--text-muted)" }}
                />
                <span className="nowrap" style={hex ? { color: hex } : undefined}>
                  {r.name}
                </span>
              </button>
            );
          })}
          {roles?.length === 0 && <div className="gs-empty muted">No roles.</div>}
        </div>
        <div className="gs-role-editor">
          {active ? (
            <RoleEditor
              key={active.id}
              guildId={guildId}
              role={active}
              onSaved={reload}
              onDeleted={() => {
                setSelected(null);
                reload();
              }}
            />
          ) : (
            <div className="gs-empty muted">Select a role to edit.</div>
          )}
        </div>
      </div>
    </section>
  );
});

function RoleEditor({
  guildId,
  role,
  onSaved,
  onDeleted,
}: {
  guildId: Snowflake;
  role: Role;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(roleColor(role.color) ?? "#99aab5");
  const [hoist, setHoist] = useState(!!role.hoist);
  const [mentionable, setMentionable] = useState(!!role.mentionable);
  const [perms, setPerms] = useState<bigint>(parsePermissions(role.permissions));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateGuildRole(guildId, role.id, {
        name,
        color: hexToColorInt(color),
        permissions: permissionsToString(perms),
        hoist,
        mentionable,
      });
      onSaved();
      toasts.success("Role saved");
    } catch (e) {
      toasts.error("Failed to save role", String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      await api.deleteGuildRole(guildId, role.id);
      onDeleted();
      toasts.success("Role deleted");
    } catch (e) {
      toasts.error("Failed to delete role", String(e));
    } finally {
      setBusy(false);
    }
  };

  const admin = hasPermission(perms, PERMISSION_FLAGS[0].bit);

  return (
    <div className="gs-role-form">
      <label className="gs-field">
        <span className="gs-field-label">Role Name</span>
        <input className="gs-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="gs-field">
        <span className="gs-field-label">Color</span>
        <input
          type="color"
          className="gs-color-input"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <label className="settings-toggle">
        <input type="checkbox" checked={hoist} onChange={(e) => setHoist(e.target.checked)} />
        <span>Display separately from other members</span>
      </label>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={mentionable}
          onChange={(e) => setMentionable(e.target.checked)}
        />
        <span>Allow anyone to @mention this role</span>
      </label>

      <div className="gs-field-label">Permissions</div>
      {admin && (
        <p className="gs-pane-help muted small">
          Administrator grants every permission and overrides the rest.
        </p>
      )}
      <div className="gs-perm-grid">
        {PERMISSION_FLAGS.map((f) => (
          <label key={f.key} className="settings-toggle">
            <input
              type="checkbox"
              checked={hasPermission(perms, f.bit)}
              onChange={(e) => setPerms(togglePermission(perms, f.bit, e.target.checked))}
            />
            <span>{f.label}</span>
          </label>
        ))}
      </div>

      <div className="gs-role-actions">
        <button className="gs-submit" onClick={save} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save Changes"}
        </button>
        <button className="gs-danger-btn" onClick={del} disabled={busy}>
          Delete Role
        </button>
      </div>
    </div>
  );
}

// Read a picked image file as a base64 data URI for emoji upload.
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Normalize an emoji name to the allowed set (alphanumerics + underscore).
function sanitizeEmojiName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
}

const EmojiPane = observer(function EmojiPane({ guildId }: { guildId: Snowflake }) {
  const emojis = guilds.emojisByGuild.get(guildId) ?? [];
  const mediaBase = session.endpoints?.media ?? session.endpoints?.static_cdn ?? "";
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api
      .listGuildEmojis(guildId)
      .then((list) => runInAction(() => guilds.emojisByGuild.set(guildId, list)))
      .catch((e) => toasts.warn("Failed to load emoji", String(e)));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires change
    if (!file) return;
    const name = sanitizeEmojiName(file.name.replace(/\.[^.]+$/, ""));
    if (!name) {
      toasts.warn("Invalid emoji name");
      return;
    }
    setBusy(true);
    try {
      const dataUri = await fileToDataUri(file);
      await api.createGuildEmoji(guildId, name, dataUri);
      await reload();
      toasts.success(`Added :${name}:`);
    } catch (err) {
      toasts.error("Failed to upload emoji", String(err));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: Snowflake, current: string) => {
    const next = sanitizeEmojiName(window.prompt("New emoji name", current) ?? "");
    if (!next || next === current) return;
    try {
      await api.updateGuildEmoji(guildId, id, next);
      await reload();
      toasts.success(`Renamed to :${next}:`);
    } catch (e) {
      toasts.error("Failed to rename emoji", String(e));
    }
  };

  const remove = async (id: Snowflake, name: string) => {
    if (!window.confirm(`Delete :${name}:?`)) return;
    try {
      await api.deleteGuildEmoji(guildId, id);
      await reload();
      toasts.success("Emoji deleted");
    } catch (e) {
      toasts.error("Failed to delete emoji", String(e));
    }
  };

  return (
    <section className="gs-pane-section">
      <div className="gs-roles-header">
        <h2 className="gs-pane-title">Emoji — {emojis.length}</h2>
        <button
          className="gs-submit"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : "Upload Emoji"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={onPick}
        />
      </div>
      <div className="gs-emoji-grid">
        {emojis.map((e) => (
          <div key={e.id} className="gs-emoji-cell" title={`:${e.name}:`}>
            <img
              className="gs-emoji-img"
              src={`${mediaBase}/emojis/${e.id}.${e.animated ? "gif" : "webp"}`}
              alt={e.name}
              loading="lazy"
            />
            <span className="gs-emoji-name nowrap">:{e.name}:</span>
            <button
              className="gs-emoji-action"
              title="Rename"
              onClick={() => rename(e.id, e.name)}
            >
              ✎
            </button>
            <button
              className="gs-emoji-action danger"
              title="Delete"
              onClick={() => remove(e.id, e.name)}
            >
              ✕
            </button>
          </div>
        ))}
        {emojis.length === 0 && <div className="gs-empty muted">No custom emoji.</div>}
      </div>
      <p className="gs-pane-help muted small">
        Upload a PNG/GIF/WebP under 256 KB. The filename becomes the shortcode.
      </p>
    </section>
  );
});

const StickersPane = observer(function StickersPane({ guildId }: { guildId: Snowflake }) {
  const stickers = guilds.stickersByGuild.get(guildId) ?? [];
  const mediaBase = session.endpoints?.media ?? session.endpoints?.static_cdn ?? "";
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api
      .listGuildStickers(guildId)
      .then((list) => runInAction(() => guilds.stickersByGuild.set(guildId, list)))
      .catch((e) => toasts.warn("Failed to load stickers", String(e)));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = sanitizeEmojiName(file.name.replace(/\.[^.]+$/, ""));
    if (!name) {
      toasts.warn("Invalid sticker name");
      return;
    }
    setBusy(true);
    try {
      const dataUri = await fileToDataUri(file);
      // Default the search tag to the name; the user can refine via rename.
      await api.createGuildSticker(guildId, name, dataUri, [name]);
      await reload();
      toasts.success(`Added sticker "${name}"`);
    } catch (err) {
      toasts.error("Failed to upload sticker", String(err));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (s: Sticker) => {
    const next = (window.prompt("New sticker name", s.name) ?? "").trim().slice(0, 30);
    if (!next || next === s.name) return;
    try {
      await api.updateGuildSticker(guildId, s.id, { name: next });
      await reload();
      toasts.success("Sticker renamed");
    } catch (e) {
      toasts.error("Failed to rename sticker", String(e));
    }
  };

  const remove = async (s: Sticker) => {
    if (!window.confirm(`Delete sticker "${s.name}"?`)) return;
    try {
      await api.deleteGuildSticker(guildId, s.id);
      await reload();
      toasts.success("Sticker deleted");
    } catch (e) {
      toasts.error("Failed to delete sticker", String(e));
    }
  };

  return (
    <section className="gs-pane-section">
      <div className="gs-roles-header">
        <h2 className="gs-pane-title">Stickers — {stickers.length}</h2>
        <button
          className="gs-submit"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : "Upload Sticker"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/apng,image/webp"
          style={{ display: "none" }}
          onChange={onPick}
        />
      </div>
      <div className="gs-emoji-grid">
        {stickers.map((s) => (
          <div key={s.id} className="gs-emoji-cell" title={s.name}>
            <img
              className="gs-emoji-img gs-sticker-img"
              src={`${mediaBase}/stickers/${s.id}.webp`}
              alt={s.name}
              loading="lazy"
            />
            <span className="gs-emoji-name nowrap">{s.name}</span>
            <button className="gs-emoji-action" title="Rename" onClick={() => rename(s)}>
              ✎
            </button>
            <button className="gs-emoji-action danger" title="Delete" onClick={() => remove(s)}>
              ✕
            </button>
          </div>
        ))}
        {stickers.length === 0 && <div className="gs-empty muted">No custom stickers.</div>}
      </div>
      <p className="gs-pane-help muted small">
        Upload a PNG/APNG/WebP sticker (512×512 recommended).
      </p>
    </section>
  );
});

// Fluxer audit-log action codes → human labels (subset; falls back to the raw code).
const AUDIT_ACTIONS: Record<number, string> = {
  1: "Guild updated",
  10: "Channel created",
  11: "Channel updated",
  12: "Channel deleted",
  20: "Member kicked",
  22: "Member banned",
  23: "Member unbanned",
  24: "Member updated",
  25: "Member roles updated",
  30: "Role created",
  31: "Role updated",
  32: "Role deleted",
  40: "Invite created",
  42: "Invite deleted",
  50: "Webhook created",
  51: "Webhook updated",
  52: "Webhook deleted",
  60: "Emoji created",
  62: "Emoji deleted",
  72: "Message deleted",
  74: "Messages pinned",
  75: "Messages unpinned",
};

const AuditPane = observer(function AuditPane({ guildId }: { guildId: Snowflake }) {
  const [log, setLog] = useState<AuditLog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .guildAuditLog(guildId)
      .then((l) => alive && setLog(l))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [guildId]);

  const userMap = new Map<string, User>((log?.users ?? []).map((u) => [u.id, u]));
  const entries = log?.audit_log_entries ?? [];

  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Audit Log{log ? ` — ${entries.length}` : ""}</h2>
      {err && <p className="gs-pane-help muted small">Failed to load audit log: {err}</p>}
      {!log && !err && <div className="gs-empty muted">Loading…</div>}
      <div className="gs-list">
        {entries.map((e) => {
          const actor = e.user_id ? userMap.get(e.user_id) : undefined;
          const who = actor ? actor.global_name ?? actor.username : "System";
          return (
            <div key={e.id} className="gs-audit-row">
              <div className="gs-audit-line">
                <span className="gs-audit-actor nowrap">{who}</span>
                <span className="gs-audit-action">
                  {AUDIT_ACTIONS[e.action_type] ?? `Action ${e.action_type}`}
                </span>
              </div>
              {e.reason && <div className="gs-audit-reason muted small">“{e.reason}”</div>}
              {e.changes && e.changes.length > 0 && (
                <div className="gs-audit-changes muted small">
                  {e.changes.map((c, i) => (
                    <span key={i} className="gs-audit-change">
                      {c.key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {entries.length === 0 && !err && log && (
          <div className="gs-empty muted">No audit entries.</div>
        )}
      </div>
    </section>
  );
});

const WebhooksPane = observer(function WebhooksPane({ guildId }: { guildId: Snowflake }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chs = guilds.channelsByGuild.get(guildId) ?? [];
  const textChannels = chs.filter((c) => c.type === channelType.GUILD_TEXT);
  const [targetChannel, setTargetChannel] = useState<Snowflake>("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setErr(null);
    return Promise.all(textChannels.map((c) => api.listChannelWebhooks(c.id).catch(() => [])))
      .then((lists) => setHooks(lists.flat()))
      .catch((e) => setErr(String(e)));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const channelName = (id?: string | null) =>
    id ? chs.find((c) => c.id === id)?.name ?? id : "—";

  const create = async () => {
    const ch = targetChannel || textChannels[0]?.id;
    if (!ch) {
      toasts.warn("No text channel to attach the webhook to.");
      return;
    }
    if (!newName.trim()) {
      toasts.warn("Webhook name required.");
      return;
    }
    setBusy(true);
    try {
      await api.createChannelWebhook(ch, newName.trim());
      setNewName("");
      await reload();
      toasts.success("Webhook created");
    } catch (e) {
      toasts.error("Failed to create webhook", String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: Snowflake, name?: string | null) => {
    if (!window.confirm(`Delete webhook "${name ?? "Webhook"}"?`)) return;
    try {
      await api.deleteWebhook(id);
      await reload();
      toasts.success("Webhook deleted");
    } catch (e) {
      toasts.error("Failed to delete webhook", String(e));
    }
  };

  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Webhooks{hooks ? ` — ${hooks.length}` : ""}</h2>
      {err && <p className="gs-pane-help muted small">Failed to load webhooks: {err}</p>}

      <div className="gs-webhook-create">
        <input
          className="gs-input"
          placeholder="Webhook name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select
          className="gs-input"
          value={targetChannel || textChannels[0]?.id || ""}
          onChange={(e) => setTargetChannel(e.target.value)}
        >
          {textChannels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
        <button className="gs-submit" onClick={create} disabled={busy || !textChannels.length}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>

      {!hooks && !err && <div className="gs-empty muted">Loading…</div>}
      <div className="gs-list">
        {hooks?.map((h) => (
          <div key={h.id} className="gs-list-row">
            <span className="gs-list-name nowrap">{h.name ?? "Webhook"}</span>
            <span className="gs-list-reason muted small nowrap">#{channelName(h.channel_id)}</span>
            <button
              className="gs-list-action"
              title="Delete webhook"
              onClick={() => remove(h.id, h.name)}
            >
              Delete
            </button>
          </div>
        ))}
        {hooks?.length === 0 && <div className="gs-empty muted">No webhooks.</div>}
      </div>
    </section>
  );
});