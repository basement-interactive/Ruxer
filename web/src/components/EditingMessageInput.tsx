// Inline message editor. Replaces a message's rendered content in place while
// the user edits it (reference-parity: the reference client edits inline, not
// via the bottom composer). Enter saves, Escape cancels; Shift+Enter inserts a
// newline. Auto-focuses and grows with content.

import { useEffect, useRef, useState } from "react";
import { messages, ui, toasts } from "../stores";
import type { Message } from "../types";
import "./EditingMessageInput.css";

export function EditingMessageInput({ message }: { message: Message }) {
  const [text, setText] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      // Put the caret at the end.
      el.selectionStart = el.selectionEnd = el.value.length;
      autosize(el);
    }
  }, []);

  const cancel = () => {
    ui.editingMessageId = null;
  };

  const save = async () => {
    const trimmed = text.trim();
    if (trimmed === message.content.trim()) {
      cancel();
      return;
    }
    if (!trimmed) {
      // Empty edit = delete, matching the reference (confirm via delete flow).
      cancel();
      return;
    }
    setSaving(true);
    try {
      await messages.edit(message.channel_id, message.id, trimmed);
      ui.editingMessageId = null;
    } catch (e) {
      toasts.error("Failed to edit message", String(e));
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="editing-message">
      <textarea
        ref={ref}
        className="editing-message-input"
        value={text}
        disabled={saving}
        spellCheck
        onChange={(e) => {
          setText(e.target.value);
          autosize(e.target);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="editing-message-hint">
        escape to{" "}
        <button className="editing-message-link" onClick={cancel}>
          cancel
        </button>{" "}
        · enter to{" "}
        <button className="editing-message-link" onClick={() => void save()}>
          save
        </button>
      </div>
    </div>
  );
}

function autosize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 400) + "px";
}
