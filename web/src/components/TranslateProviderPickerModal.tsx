// TranslateProviderPickerModal: first-use provider picker. Shown when the
// user hits Translate without a persisted default provider; the pick is
// remembered (and force-enabled), then the translate URL opens externally.

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { ui, translation } from "../stores";
import { api } from "../api";
import { Modal } from "./Modal";

export const TranslateProviderPickerModal = observer(function TranslateProviderPickerModal() {
  const picker = ui.translatePicker;
  if (!picker) return null;

  const [selected, setSelected] = useState(
    () =>
      translation.defaultEngine?.id ??
      translation.effectiveDefaultEngine?.id ??
      translation.engines[0]?.id ??
      "",
  );

  const submit = () => {
    if (!selected) return;
    translation.setDefaultEngine(selected);
    const url = translation.buildSearchUrl(selected, picker.text);
    if (url) void api.openExternal(url);
    ui.closeTranslatePicker();
  };

  return (
    <Modal
      open
      onClose={() => ui.closeTranslatePicker()}
      title="Pick a translation provider"
      description="Choose where Fluxer should send highlighted text for translation. We'll remember your pick. You can change it or add your own provider later in Settings → Chat."
      size="small"
      footer={
        <>
          <button className="forward-btn-secondary" onClick={() => ui.closeTranslatePicker()}>
            Cancel
          </button>
          <button className="forward-btn-primary" disabled={!selected} onClick={submit}>
            Translate
          </button>
        </>
      }
    >
      <label className="schedule-field">
        <span className="schedule-field-label">Translation provider</span>
        <select
          className="schedule-input"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {translation.engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
});
