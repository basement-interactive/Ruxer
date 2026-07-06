// Ban-member modal — collects an optional reason and a message-deletion window
// before banning. The backend `ban_user` command already accepts both
// (reason + delete_message_seconds); previously the only caller hardcoded them
// to undefined/0, so this wires the real moderation flow. Guild-mgmt parity #3.

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { ui, resolveUser, toasts } from "../stores";
import { api } from "../api";
import { Modal } from "./Modal";
import "./BanMemberModal.css";

const DELETE_OPTIONS = [
  { label: "Don't delete any", value: 0 },
  { label: "Previous 1 hour", value: 3600 },
  { label: "Previous 24 hours", value: 86400 },
  { label: "Previous 7 days", value: 604800 },
];

export const BanMemberModal = observer(function BanMemberModal() {
  const target = ui.banTarget;
  const [reason, setReason] = useState("");
  const [deleteSeconds, setDeleteSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason("");
    setDeleteSeconds(0);
    setBusy(false);
  }, [target?.userId]);

  if (!target) return null;
  const user = resolveUser(target.userId);
  const name = user.global_name ?? user.username;

  const confirm = async () => {
    setBusy(true);
    try {
      await api.banUser(
        target.guildId,
        target.userId,
        reason.trim() || undefined,
        deleteSeconds,
      );
      toasts.success(`Banned ${name}`);
      ui.closeBanModal();
    } catch (e) {
      toasts.error("Failed to ban", String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => ui.closeBanModal()}
      title={`Ban ${name}`}
      size="small"
      footer={
        <div className="ban-modal-footer">
          <button className="ban-cancel" onClick={() => ui.closeBanModal()} disabled={busy}>
            Cancel
          </button>
          <button className="ban-confirm" onClick={confirm} disabled={busy}>
            {busy ? "Banning…" : "Ban"}
          </button>
        </div>
      }
    >
      <div className="ban-modal-body">
        <label className="ban-field">
          <span className="ban-field-label">Reason (optional)</span>
          <input
            className="ban-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for the ban"
            maxLength={512}
            autoFocus
          />
        </label>
        <label className="ban-field">
          <span className="ban-field-label">Delete recent messages</span>
          <select
            className="ban-select"
            value={deleteSeconds}
            onChange={(e) => setDeleteSeconds(Number(e.target.value))}
          >
            {DELETE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
});
