// ScheduledPane: right-side panel listing the user's pending scheduled
// messages (all channels). Cards show delivery time, status, and content;
// hover reveals Edit (reschedule via the composer) and Cancel actions.

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { ui, scheduled, toasts, resolveChannelName } from "../stores";
import type { ScheduledMessage } from "../types";
import { api } from "../api";
import "./ScheduledPane.css";

export const ScheduledPane = observer(function ScheduledPane() {
  useEffect(() => {
    void scheduled.fetch();
  }, []);

  const empty = scheduled.fetched && scheduled.list.length === 0;

  return (
    <aside className="scheduled-pane">
      <div className="scheduled-pane-header">
        <span>Scheduled messages</span>
        <button className="scheduled-close" onClick={() => (ui.rightPane = "none")}>
          ✕
        </button>
      </div>
      <div className="scheduled-pane-scroll">
        {!scheduled.fetched && <div className="scheduled-empty muted">Loading…</div>}
        {empty && (
          <div className="scheduled-empty-state">
            <div className="scheduled-empty-title">No scheduled messages</div>
            <div className="scheduled-empty-desc muted">
              Right-click the message box to schedule a message.
            </div>
          </div>
        )}
        {scheduled.list.map((m) => (
          <ScheduledCard key={m.id} record={m} />
        ))}
        {scheduled.fetched && scheduled.list.length > 0 && (
          <div className="scheduled-end muted small">
            You're caught up — that's everything in the queue.
          </div>
        )}
      </div>
    </aside>
  );
});

const ScheduledCard = observer(function ScheduledCard({ record }: { record: ScheduledMessage }) {
  const [cancelling, setCancelling] = useState(false);
  const invalid = record.status === "invalid";
  const content = record.payload?.content ?? "";
  const attachmentCount = record.payload?.attachments?.length ?? 0;
  const channelName = resolveChannelName(record.channel_id);

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await api.cancelScheduledMessage(record.id);
      scheduled.remove(record.id);
      toasts.success("Removed scheduled message");
    } catch (e) {
      toasts.error("Failed to cancel scheduled message", String(e));
      setCancelling(false);
    }
  };

  return (
    <div className="scheduled-card">
      <div className="scheduled-card-header">
        <span className={"scheduled-pill" + (invalid ? " invalid" : "")}>
          {invalid ? "Invalid" : "Scheduled"}
        </span>
        <span className="scheduled-card-time muted small">{deliveryLabel(record)}</span>
      </div>
      {channelName && <div className="scheduled-card-channel muted small">{channelName}</div>}
      <div className="scheduled-card-content">
        {content || (attachmentCount > 0 ? "Attachment only message" : "(no content)")}
      </div>
      {attachmentCount > 0 && (
        <div className="scheduled-card-attachments muted small">
          Attachments: {attachmentCount}
        </div>
      )}
      {invalid && record.status_reason && (
        <div className="scheduled-card-reason">⚠ {record.status_reason}</div>
      )}
      <div className="scheduled-card-actions">
        <button
          className="scheduled-card-action"
          onClick={() => {
            ui.startScheduledEdit(record);
            ui.openScheduleModal();
          }}
        >
          Edit
        </button>
        <button className="scheduled-card-action" disabled={cancelling} onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
});

/// "Jun 28, 2026, 9:41 AM" in the schedule's own timezone; falls back to the
/// raw "local (zone)" pair when the timezone/date can't be formatted.
function deliveryLabel(m: ScheduledMessage): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: m.timezone,
    }).format(new Date(m.scheduled_at));
  } catch {
    return `${m.scheduled_local_at} (${m.timezone})`;
  }
}
