import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadAutoSavePreference,
  saveAutoSavePreference,
  saveLabel,
} from '../lib/autoSave';
import type { SaveState, WorkspaceMode } from '../lib/types';

export function useAutoSave(onTurnOff?: () => void) {
  const [autoSave, setAutoSave] = useState<boolean>(loadAutoSavePreference);
  const autoSaveRef = useRef<boolean>(autoSave);

  useEffect(() => {
    autoSaveRef.current = autoSave;
    saveAutoSavePreference(autoSave);
  }, [autoSave]);

  const toggleAutoSave = useCallback(() => {
    setAutoSave((current) => {
      const next = !current;
      autoSaveRef.current = next;
      if (!next) {
        onTurnOff?.();
      }
      return next;
    });
  }, [onTurnOff]);

  return { autoSave, autoSaveRef, toggleAutoSave };
}

export function SaveControls({
  mode,
  saveState,
  autoSave,
  canManualSave,
  onToggleAutoSave,
  onManualSave,
}: {
  mode: WorkspaceMode;
  saveState: SaveState;
  autoSave: boolean;
  canManualSave: boolean;
  onToggleAutoSave: () => void;
  onManualSave: () => void;
}) {
  const statusIndicator = (
    <span className={`save-state save-${saveState}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      {saveLabel(saveState)}
    </span>
  );

  if (mode !== 'online') {
    return statusIndicator;
  }

  return (
    <div className="cloud-save-controls" role="group" aria-label="Save controls">
      {statusIndicator}
      <button
        className={`ghost-button compact topbar-save-button ${canManualSave ? 'is-dirty' : ''}`}
        type="button"
        disabled={!canManualSave}
        aria-label="Save note"
        title="Save note (Ctrl/Cmd + S)"
        onClick={onManualSave}
      >
        Save
      </button>
      <button
        className={`ghost-button compact auto-save-toggle ${autoSave ? 'is-enabled' : ''}`}
        type="button"
        aria-pressed={autoSave}
        aria-label={autoSave ? 'Auto-save: On' : 'Auto-save: Off'}
        title={
          autoSave
            ? 'Auto-save is on — click to turn off'
            : 'Auto-save is off — click to turn on'
        }
        onClick={onToggleAutoSave}
      >
        <span className="auto-save-dot" aria-hidden="true" />
        <span className="auto-save-label">Auto-save</span>
        <span className="auto-save-value">{autoSave ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
