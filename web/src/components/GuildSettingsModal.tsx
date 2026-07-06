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
import { Modal } from "./Modal";
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
    // Open to the requested tab (openGuildSettings(id, tab)) or default overview.
    if (open) setPane((ui.guildSettingsInitialTab as Pane) ?? "overview");
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
  const [name, setName] = useState(g.name);
  const [savingName, setSavingName] = useState(false);
  useEffect(() => setName(g.name), [g.name]);

  const iconInput = useRef<HTMLInputElement>(null);
  const changeIcon = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUri = await fileToDataUri(file);
      const updated = (await api.updateGuild(guildId, { icon: dataUri })) as { icon?: string | null };
      runInAction(() => {
        if (updated && "icon" in updated) g.icon = updated.icon ?? g.icon;
      });
      toasts.success("Server icon updated");
    } catch (e) {
      toasts.error("Failed to update icon", String(e));
    }
  };

  const [vanity, setVanity] = useState("");
  const [savingVanity, setSavingVanity] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .getGuildVanity(guildId)
      .then((v) => !cancelled && setVanity(v.code ?? ""))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const saveVanity = async () => {
    setSavingVanity(true);
    try {
      const res = await api.setGuildVanity(guildId, vanity.trim());
      setVanity(res.code ?? vanity.trim());
      toasts.success("Vanity URL updated");
    } catch (e) {
      toasts.error("Failed to set vanity URL", String(e));
    } finally {
      setSavingVanity(false);
    }
  };

  const [transferOpen, setTransferOpen] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [transferPw, setTransferPw] = useState("");
  const [transferring, setTransferring] = useState(false);
  const otherMembers = (guilds.membersByGuild.get(guildId) ?? []).filter(
    (m) => m.user.id !== session.meId,
  );

  const transfer = async () => {
    if (!newOwner || !transferPw) return;
    setTransferring(true);
    try {
      await api.transferGuildOwnership(guildId, newOwner, transferPw);
      runInAction(() => {
        g.owner_id = newOwner;
      });
      toasts.success("Ownership transferred");
      setTransferOpen(false);
      setTransferPw("");
    } catch (e) {
      toasts.error("Failed to transfer ownership", String(e));
    } finally {
      setTransferring(false);
    }
  };

  const saveName = async () => {
    const next = name.trim();
    if (!next || next === g.name) return;
    setSavingName(true);
    try {
      await api.updateGuild(guildId, { name: next });
      runInAction(() => {
        g.name = next;
      });
      toasts.success("Server name updated");
    } catch (e) {
      toasts.error("Failed to update server", String(e));
    } finally {
      setSavingName(false);
    }
  };

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
        <button
          className="gs-icon-edit"
          title="Change server icon"
          onClick={() => iconInput.current?.click()}
        >
          <GuildIcon guild={g} size={80} />
          <span className="gs-icon-edit-overlay">Change</span>
        </button>
        <input
          ref={iconInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => changeIcon(e.target.files?.[0])}
        />
        <div className="gs-overview-info">
          <div className="gs-overview-name">{g.name}</div>
          <div className="gs-overview-meta muted small">
            {(guilds.membersByGuild.get(guildId)?.length ?? 0)} members
          </div>
        </div>
      </div>
      <div className="gs-field" style={{ maxWidth: "26rem", marginTop: "var(--sp-3, 12px)" }}>
        <span className="gs-field-label">Server Name</span>
        <div style={{ display: "flex", gap: "var(--sp-2, 8px)" }}>
          <input
            className="gs-input"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
            }}
          />
          <button
            className="gs-submit"
            onClick={saveName}
            disabled={savingName || !name.trim() || name.trim() === g.name}
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="gs-pane-help muted small">
        Click the server icon to upload a new one.
      </p>

      <div className="gs-field" style={{ maxWidth: "26rem", marginTop: "var(--sp-3, 12px)" }}>
        <span className="gs-field-label">Verification Level</span>
        <select
          className="gs-input"
          value={g.verification_level ?? 0}
          onChange={(e) => {
            const level = Number(e.target.value);
            runInAction(() => {
              g.verification_level = level;
            });
            api
              .updateGuild(guildId, { verification_level: level })
              .catch((err) => toasts.error("Failed to set verification level", String(err)));
          }}
        >
          <option value={0}>None — unrestricted</option>
          <option value={1}>Low — verified email</option>
          <option value={2}>Medium — registered 5+ minutes</option>
          <option value={3}>High — member 10+ minutes</option>
          <option value={4}>Highest — verified phone</option>
        </select>
      </div>

      <div className="gs-field" style={{ maxWidth: "26rem", marginTop: "var(--sp-3, 12px)" }}>
        <span className="gs-field-label">Vanity Invite URL</span>
        <div style={{ display: "flex", gap: "var(--sp-2, 8px)", alignItems: "center" }}>
          <span className="muted small">fluxer.app/</span>
          <input
            className="gs-input"
            value={vanity}
            maxLength={32}
            placeholder="custom-code"
            onChange={(e) => setVanity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveVanity();
            }}
          />
          <button className="gs-submit" onClick={saveVanity} disabled={savingVanity}>
            {savingVanity ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {isOwner && (
        <div className="gs-danger-zone">
          <div className="gs-danger-title">Danger Zone</div>
          {otherMembers.length > 0 && (
            <button
              className="gs-danger-btn"
              style={{ marginRight: "var(--sp-2, 8px)" }}
              onClick={() => {
                setNewOwner(otherMembers[0].user.id);
                setTransferOpen(true);
              }}
            >
              Transfer Ownership
            </button>
          )}
          <button className="gs-danger-btn" onClick={() => setConfirming(true)}>
            Delete Server
          </button>
          <Modal
            open={transferOpen}
            onClose={() => setTransferOpen(false)}
            title="Transfer Ownership"
            size="small"
            footer={
              <div className="ban-modal-footer">
                <button className="ban-cancel" onClick={() => setTransferOpen(false)} disabled={transferring}>
                  Cancel
                </button>
                <button
                  className="ban-confirm"
                  onClick={transfer}
                  disabled={transferring || !newOwner || !transferPw}
                >
                  {transferring ? "Transferring…" : "Transfer"}
                </button>
              </div>
            }
          >
            <div className="ban-modal-body">
              <label className="ban-field">
                <span className="ban-field-label">New owner</span>
                <select className="gs-input" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
                  {otherMembers.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.global_name ?? m.user.username}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ban-field">
                <span className="ban-field-label">Your password</span>
                <input
                  className="ban-input"
                  type="password"
                  value={transferPw}
                  onChange={(e) => setTransferPw(e.target.value)}
                  placeholder="Confirm with your account password"
                />
              </label>
            </div>
          </Modal>
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

const INVITE_EXPIRY = [
  { label: "Never", value: 0 },
  { label: "30 minutes", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "1 day", value: 86400 },
  { label: "7 days", value: 604800 },
];
const INVITE_USES = [
  { label: "No limit", value: 0 },
  { label: "1 use", value: 1 },
  { label: "5 uses", value: 5 },
  { label: "10 uses", value: 10 },
  { label: "25 uses", value: 25 },
  { label: "50 uses", value: 50 },
  { label: "100 uses", value: 100 },
];

const InvitesPane = observer(function InvitesPane({ guildId }: { guildId: Snowflake }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const chs = guilds.channelsByGuild.get(guildId) ?? [];
  const textChannels = chs.filter((c) => c.type === channelType.GUILD_TEXT);
  const firstText = textChannels[0];
  const [targetChannel, setTargetChannel] = useState<Snowflake>("");
  const [maxAge, setMaxAge] = useState(0);
  const [maxUses, setMaxUses] = useState(0);

  const refresh = async () => {
    try {
      // List ALL invites across the guild (was limited to the first channel).
      const list = await api.listGuildInvites(guildId);
      setInvites(list);
    } catch (e) {
      toasts.warn("Failed to load invites", String(e));
    }
  };
  useEffect(() => {
    refresh();
  }, [guildId]);

  const create = async () => {
    const ch = targetChannel || firstText?.id;
    if (!ch) {
      toasts.warn("No text channel to create an invite for.");
      return;
    }
    setBusy(true);
    try {
      await api.createChannelInvite(ch, maxAge, maxUses);
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
      <div className="gs-invite-controls">
        <label className="gs-field">
          <span className="gs-field-label">Channel</span>
          <select
            className="gs-input"
            value={targetChannel || firstText?.id || ""}
            onChange={(e) => setTargetChannel(e.target.value)}
          >
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="gs-field">
          <span className="gs-field-label">Expire after</span>
          <select className="gs-input" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}>
            {INVITE_EXPIRY.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="gs-field">
          <span className="gs-field-label">Max uses</span>
          <select className="gs-input" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
            {INVITE_USES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
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

  // Roles are listed highest-position-first; Move Up raises the role in the
  // hierarchy by swapping positions with the adjacent role. The server rejects
  // moving @everyone or above the caller's highest role.
  const moveRole = async (i: number, dir: -1 | 1) => {
    if (!roles) return;
    const j = i + dir;
    if (j < 0 || j >= roles.length) return;
    const a = roles[i];
    const b = roles[j];
    try {
      await api.reorderRoles(guildId, [
        { id: a.id, position: b.position },
        { id: b.id, position: a.position },
      ]);
      const next = roles.map((r) =>
        r.id === a.id ? { ...a, position: b.position } : r.id === b.id ? { ...b, position: a.position } : r,
      );
      next.sort((x, y) => y.position - x.position);
      setRoles(next);
    } catch (e) {
      toasts.error("Failed to reorder role", String(e));
    }
  };

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
          {roles?.map((r, i) => {
            const hex = roleColor(r.color);
            return (
              <div key={r.id} className="gs-role-row">
                <button
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
                <div className="gs-role-move">
                  <button
                    className="gs-role-move-btn"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => moveRole(i, -1)}
                  >
                    ▲
                  </button>
                  <button
                    className="gs-role-move-btn"
                    title="Move down"
                    disabled={i >= (roles?.length ?? 0) - 1}
                    onClick={() => moveRole(i, 1)}
                  >
                    ▼
                  </button>
                </div>
              </div>
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
  const [action, setAction] = useState<number | "">("");
  const [limit, setLimit] = useState(50);
  useEffect(() => {
    let alive = true;
    setLog(null);
    setErr(null);
    api
      .guildAuditLog(guildId, {
        limit,
        actionType: action === "" ? undefined : action,
      })
      .then((l) => alive && setLog(l))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [guildId, action, limit]);

  const userMap = new Map<string, User>((log?.users ?? []).map((u) => [u.id, u]));
  const entries = log?.audit_log_entries ?? [];

  return (
    <section className="gs-pane-section">
      <h2 className="gs-pane-title">Audit Log{log ? ` — ${entries.length}` : ""}</h2>
      <div className="gs-invite-controls">
        <label className="gs-field">
          <span className="gs-field-label">Filter by action</span>
          <select
            className="gs-input"
            value={action}
            onChange={(e) => setAction(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All actions</option>
            {Object.entries(AUDIT_ACTIONS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="gs-field">
          <span className="gs-field-label">Show</span>
          <select className="gs-input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={25}>25 entries</option>
            <option value={50}>50 entries</option>
            <option value={100}>100 entries</option>
          </select>
        </label>
      </div>
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
  const [editingId, setEditingId] = useState<Snowflake | null>(null);
  const [editName, setEditName] = useState("");

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

  const saveRename = async (id: Snowflake) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await api.updateWebhook(id, { name });
      setEditingId(null);
      await reload();
      toasts.success("Webhook renamed");
    } catch (e) {
      toasts.error("Failed to rename webhook", String(e));
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
        {hooks?.map((h) =>
          editingId === h.id ? (
            <div key={h.id} className="gs-list-row">
              <input
                className="gs-input"
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(h.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <button className="gs-list-action" onClick={() => saveRename(h.id)}>
                Save
              </button>
              <button className="gs-list-action" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <div key={h.id} className="gs-list-row">
              <span className="gs-list-name nowrap">{h.name ?? "Webhook"}</span>
              <span className="gs-list-reason muted small nowrap">#{channelName(h.channel_id)}</span>
              <button
                className="gs-list-action"
                title="Rename webhook"
                onClick={() => {
                  setEditingId(h.id);
                  setEditName(h.name ?? "");
                }}
              >
                Rename
              </button>
              <button
                className="gs-list-action"
                title="Delete webhook"
                onClick={() => remove(h.id, h.name)}
              >
                Delete
              </button>
            </div>
          ),
        )}
        {hooks?.length === 0 && <div className="gs-empty muted">No webhooks.</div>}
      </div>
    </section>
  );
});