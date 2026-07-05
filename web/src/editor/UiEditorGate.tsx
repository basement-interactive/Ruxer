// Mounts the UI editor and toggles it with Ctrl+Shift+U. Also restores the
// user's last active layout on boot so customizations survive a restart.
// Rendered once at the app root.

import { useEffect, useState } from "react";
import { LayoutEngine } from "./LayoutEngine";
import { UiEditorPanel } from "./UiEditorPanel";

export function UiEditorGate() {
  const [open, setOpen] = useState(false);

  // Re-apply the saved active layout once on mount.
  useEffect(() => {
    LayoutEngine.restore();
  }, []);

  // Ctrl+Shift+U toggles the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return <UiEditorPanel onClose={() => setOpen(false)} />;
}
