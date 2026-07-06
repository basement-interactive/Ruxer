// ScheduleMessageModal: pick a delivery date/time + timezone for a scheduled
// message. Used for both scheduling (from the composer) and rescheduling
// (from the scheduled-messages pane). The parent owns the submit.

import { useState } from "react";
import { Modal } from "./Modal";
import "./ScheduleMessageModal.css";

const MS_PER_DAY = 86_400_000;

/// datetime-local input value formatter. Parity note: the reference derives
/// min/max/default from Date.toISOString() (UTC) even though the input is
/// local time — kept as-is for 1:1 behavior.
function formatInputValue(d: Date): string {
  return d.toISOString().slice(0, 16);
}

function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function timezoneOptions(): string[] {
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.("timeZone");
    if (zones && zones.length > 0) return zones;
  } catch {
    // fall through to the single-zone fallback
  }
  return [systemTimeZone()];
}

export function ScheduleMessageModal({
  open,
  onClose,
  onSubmit,
  initialScheduledLocalAt,
  initialTimezone,
  title = "Schedule message",
  submitLabel = "Schedule",
  helpText = "Scheduled messages can be at most 30 days in the future.",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (scheduledLocalAt: string, timezone: string) => Promise<void>;
  initialScheduledLocalAt?: string;
  initialTimezone?: string;
  title?: string;
  submitLabel?: string;
  helpText?: string;
}) {
  const [datetime, setDatetime] = useState(
    () => initialScheduledLocalAt ?? formatInputValue(new Date(Date.now() + 5 * 60_000)),
  );
  const [timezone, setTimezone] = useState(() => initialTimezone ?? systemTimeZone());
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const min = formatInputValue(new Date(Date.now() + 60_000));
  const max = formatInputValue(new Date(Date.now() + 30 * MS_PER_DAY));

  const submit = async () => {
    if (!datetime || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(datetime, timezone);
      onClose();
    } finally {
      // Stays open on error (the parent toasts); resets the spinner.
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Pick a time when this message should be posted."
      size="small"
      className="schedule-modal"
      footer={
        <>
          <button className="schedule-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="schedule-btn-primary"
            disabled={!datetime || submitting}
            onClick={submit}
          >
            {submitting ? "…" : submitLabel}
          </button>
        </>
      }
    >
      <label className="schedule-field">
        <span className="schedule-field-label">Date &amp; time</span>
        <input
          type="datetime-local"
          className="schedule-input"
          value={datetime}
          min={min}
          max={max}
          onChange={(e) => setDatetime(e.target.value)}
        />
      </label>
      <label className="schedule-field">
        <span className="schedule-field-label">Timezone</span>
        <select
          className="schedule-input"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {timezoneOptions().map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <span className="schedule-field-help muted small">{helpText}</span>
      </label>
    </Modal>
  );
}
