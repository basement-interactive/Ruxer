// CreateJoinGuildModal: a modal for the GuildsRail add/discover buttons. Two
// tabs: "Create" (name a new guild) and "Join" (paste an invite code/URL,
// preview, confirm). Discovery is stubbed to link to fluxer.app for now since
// the discovery browsing endpoint isn't part of the locked REST set.

import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { useEffect, useState } from "react";
import { guilds, ui, toasts } from "../stores";
import { api } from "../api";
import type { Guild, Invite, Snowflake } from "../types";
import { GuildIcon } from "./GuildIcon";
import "./CreateJoinGuildModal.css";

type Tab = "create" | "join";

export const CreateJoinGuildModal = observer(function CreateJoinGuildModal() {
  const open = ui.createGuildOpen;
  const [tab, setTab] = useState<Tab>("create");

  useEffect(() => {
    if (open) setTab("create");
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeCreateGuild();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="cjg-overlay" onClick={() => ui.closeCreateGuild()}>
      <div className="cjg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cjg-tabs">
          <button
            className={`cjg-tab ${tab === "create" ? "selected" : ""}`}
            onClick={() => setTab("create")}
          >
            Create a Server
          </button>
          <button
            className={`cjg-tab ${tab === "join" ? "selected" : ""}`}
            onClick={() => setTab("join")}
          >
            Join a Server
          </button>
        </div>
        <button className="cjg-close" title="Close" onClick={() => ui.closeCreateGuild()}>
          ✕
        </button>
        <div className="cjg-body">
          {tab === "create" ? <CreatePane /> : <JoinPane />}
        </div>
      </div>
    </div>
  );
});

const CreatePane = observer(function CreatePane() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toasts.warn("Server name must be at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      const g: Guild = await api.createGuild(trimmed);
      runInActionAddGuild(g);
      toasts.success(`Created "${g.name}"`);
      ui.closeCreateGuild();
    } catch (e) {
      toasts.error("Failed to create server", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cjg-pane">
      <h2 className="cjg-title">Create your server</h2>
      <p className="cjg-help muted">
        Give your new server a name. You can change it later in server settings.
      </p>
      <label className="cjg-label">Server Name</label>
      <input
        className="cjg-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My Awesome Server"
        maxLength={100}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            create();
          }
        }}
      />
      <div className="cjg-actions">
        <button className="cjg-cancel" onClick={() => ui.closeCreateGuild()}>
          Cancel
        </button>
        <button className="cjg-submit" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
});

const JoinPane = observer(function JoinPane() {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Invite | null>(null);
  const [fetching, setFetching] = useState(false);
  const [joining, setJoining] = useState(false);

  // Normalize paste of full invite URLs (`https://fluxer.app/invite/{code}`)
  // down to the bare code.
  const normalizedCode = extractInviteCode(code);

  const fetchPreview = async () => {
    if (!normalizedCode) {
      setPreview(null);
      return;
    }
    setFetching(true);
    try {
      const inv = await api.fetchInvite(normalizedCode);
      setPreview(inv);
    } catch (e) {
      setPreview(null);
      toasts.error("Invite not found", String(e));
    } finally {
      setFetching(false);
    }
  };

  const join = async () => {
    if (!normalizedCode) return;
    setJoining(true);
    try {
      const result = await api.acceptInvite(normalizedCode);
      if (result.kind === "Guild") {
        // Reload the guild list so the new guild appears, then select it.
        await reloadGuildsAndSelect(result.guild.id);
        toasts.success(`Joined "${result.guild.name}"`);
      } else {
        // Group-DM invite: switch to the DM view + open the channel.
        ui.selectDm();
        ui.openChannel(result.channel.id);
        toasts.success("Joined group DM");
      }
      ui.closeCreateGuild();
    } catch (e) {
      toasts.error("Failed to join", String(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="cjg-pane">
      <h2 className="cjg-title">Join a server</h2>
      <p className="cjg-help muted">
        Paste an invite link or code below. We'll preview the server before you join.
      </p>
      <label className="cjg-label">Invite Link or Code</label>
      <input
        className="cjg-input"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setPreview(null);
        }}
        placeholder="https://fluxer.app/invite/abcd123 or abcd123"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (preview) join();
            else fetchPreview();
          }
        }}
      />
      <div className="cjg-actions">
        <button className="cjg-cancel" onClick={() => ui.closeCreateGuild()}>
          Cancel
        </button>
        {!preview ? (
          <button
            className="cjg-submit"
            onClick={fetchPreview}
            disabled={fetching || !normalizedCode}
          >
            {fetching ? "Looking up…" : "Preview"}
          </button>
        ) : (
          <button className="cjg-submit" onClick={join} disabled={joining}>
            {joining ? "Joining…" : "Join Server"}
          </button>
        )}
      </div>

      {preview && (
        <div className="cjg-preview">
          <div className="cjg-preview-icon">
            <GuildIcon guild={preview.guild as unknown as Guild} size={64} />
          </div>
          <div className="cjg-preview-info">
            <div className="cjg-preview-name">
              {preview.guild?.name ?? "Unknown server"}
            </div>
            {preview.approximate_member_count != null && (
              <div className="cjg-preview-meta muted small">
                {preview.approximate_member_count} members
                {preview.approximate_presence_count != null &&
                  ` · ${preview.approximate_presence_count} online`}
              </div>
            )}
            {preview.channel?.name && (
              <div className="cjg-preview-channel muted small">
                Channel: #{preview.channel.name}
              </div>
            )}
            {preview.revoked && (
              <div className="cjg-preview-revoked">This invite has been revoked.</div>
            )}
          </div>
        </div>
      )}

      <div className="cjg-discovery">
        <span className="muted small">Looking for servers to join?</span>{" "}
        <a
          href="https://fluxer.app/discovery"
          target="_blank"
          rel="noreferrer"
          className="cjg-link"
        >
          Browse Discovery
        </a>
      </div>
    </div>
  );
});

/// Extract the invite code from a pasted URL or bare code.
/// `https://fluxer.app/invite/abcd123` -> `abcd123`; `abcd123` -> `abcd123`.
function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Pull the last path segment of a URL.
  const match = trimmed.match(/(?:\/invite\/|^)([A-Za-z0-9]+)/);
  if (match) return match[1];
  return trimmed;
}

/// Add a freshly created guild to the store + select it.
function runInActionAddGuild(g: Guild) {
  runInAction(() => {
    guilds.guilds = [...guilds.guilds, g];
  });
  ui.selectGuild(guilds.guilds.length - 1);
}

/// Reload the guild list (so the new guild appears) and select the joined guild.
async function reloadGuildsAndSelect(guildId: Snowflake) {
  const list = await api.listGuilds();
  const idx = list.findIndex((g) => g.id === guildId);
  if (idx >= 0) {
    runInAction(() => {
      guilds.guilds = list;
    });
    ui.selectGuild(idx);
  }
}