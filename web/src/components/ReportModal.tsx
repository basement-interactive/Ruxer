// ReportModal: report a message, user, or guild for moderation review. Opened
// from message/user/guild context menus via ui.openReport(...). Posts to the
// /reports/{kind} endpoint with the selected category.

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { ui, toasts } from "../stores";
import { api } from "../api";
import "./ReportModal.css";

// Category options per report kind, mirroring the server-side enums. Labels are
// human-readable; the value is the API category string.
const MESSAGE_CATEGORIES: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "violent_content", label: "Violent content" },
  { value: "spam", label: "Spam" },
  { value: "nsfw_violation", label: "NSFW violation" },
  { value: "illegal_activity", label: "Illegal activity" },
  { value: "doxxing", label: "Doxxing" },
  { value: "self_harm", label: "Self-harm" },
  { value: "child_safety", label: "Child safety" },
  { value: "malicious_links", label: "Malicious links" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

const USER_CATEGORIES: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "spam_account", label: "Spam account" },
  { value: "impersonation", label: "Impersonation" },
  { value: "underage_user", label: "Underage user" },
  { value: "inappropriate_profile", label: "Inappropriate profile" },
  { value: "other", label: "Other" },
];

const GUILD_CATEGORIES: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "extremist_community", label: "Extremist community" },
  { value: "illegal_activity", label: "Illegal activity" },
  { value: "child_safety", label: "Child safety" },
  { value: "raid_coordination", label: "Raid coordination" },
  { value: "spam", label: "Spam" },
  { value: "malware_distribution", label: "Malware distribution" },
  { value: "other", label: "Other" },
];

export const ReportModal = observer(function ReportModal() {
  const target = ui.reportTarget;
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const categories =
    target.kind === "message"
      ? MESSAGE_CATEGORIES
      : target.kind === "user"
        ? USER_CATEGORIES
        : GUILD_CATEGORIES;

  const title =
    target.kind === "message"
      ? "Report Message"
      : target.kind === "user"
        ? "Report User"
        : "Report Server";

  const close = () => {
    setCategory("");
    ui.closeReport();
  };

  const submit = async () => {
    if (!category) {
      toasts.warn("Select a category");
      return;
    }
    setBusy(true);
    try {
      if (target.kind === "message") {
        await api.reportMessage(target.channelId, target.messageId, category);
      } else if (target.kind === "user") {
        await api.reportUser(target.userId, category, target.guildId);
      } else {
        await api.reportGuild(target.guildId, category);
      }
      toasts.success("Report submitted. Thank you.");
      close();
    } catch (e) {
      toasts.error("Failed to submit report", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-overlay" onClick={close}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="report-title">{title}</h2>
        <p className="report-help muted small">
          Choose the reason that best describes the issue. Reports are reviewed by
          the moderation team.
        </p>
        <div className="report-categories">
          {categories.map((c) => (
            <label key={c.value} className="report-category">
              <input
                type="radio"
                name="report-category"
                checked={category === c.value}
                onChange={() => setCategory(c.value)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div className="report-actions">
          <button className="report-cancel" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="report-submit" onClick={submit} disabled={busy || !category}>
            {busy ? "Submitting…" : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
});
