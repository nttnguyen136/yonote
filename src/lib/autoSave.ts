import type { StorageLike } from './offlineStorage.ts';
import type { SaveState, WorkspaceMode } from './types.ts';

export const AUTO_SAVE_STORAGE_KEY = 'yonote-auto-save-v1';
export const DEFAULT_AUTO_SAVE = false;

export function parseAutoSavePreference(raw: string | null): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return DEFAULT_AUTO_SAVE;
}

export function loadAutoSavePreference(storage?: Pick<StorageLike, 'getItem'>): boolean {
  try {
    const targetStorage = storage ?? window.localStorage;
    return parseAutoSavePreference(targetStorage.getItem(AUTO_SAVE_STORAGE_KEY));
  } catch {
    return DEFAULT_AUTO_SAVE;
  }
}

export function saveAutoSavePreference(
  enabled: boolean,
  storage?: Pick<StorageLike, 'setItem'>,
): boolean {
  try {
    const targetStorage = storage ?? window.localStorage;
    targetStorage.setItem(AUTO_SAVE_STORAGE_KEY, enabled ? 'true' : 'false');
    return true;
  } catch {
    return false;
  }
}

export function shouldScheduleAutoSave(
  mode: WorkspaceMode,
  autoSave: boolean,
  selectedId: string | null,
  dirtyIds: ReadonlySet<string>,
): selectedId is string {
  return Boolean(mode === 'online' && autoSave && selectedId && dirtyIds.has(selectedId));
}

export function shouldAutoFlushOnTransition(
  mode: WorkspaceMode,
  autoSave: boolean,
  selectedId: string | null,
  dirtyIds: ReadonlySet<string>,
): selectedId is string {
  return Boolean(mode === 'online' && autoSave && selectedId && dirtyIds.has(selectedId));
}

export function resolveNoteSaveState(
  mode: WorkspaceMode,
  noteId: string | null,
  dirtyIds: ReadonlySet<string>,
): SaveState {
  if (mode === 'offline') return 'offline';
  if (!noteId) return 'idle';
  return dirtyIds.has(noteId) ? 'unsaved' : 'saved';
}

export function canManualSaveNote(
  mode: WorkspaceMode,
  hasSelectedNote: boolean,
  isLocalPreviewActive: boolean,
  saveState: SaveState,
): boolean {
  return (
    mode === 'online' &&
    hasSelectedNote &&
    !isLocalPreviewActive &&
    (saveState === 'unsaved' || saveState === 'error' || saveState === 'conflict')
  );
}

export function saveLabel(state: SaveState): string {
  switch (state) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'unsaved':
      return 'Unsaved';
    case 'offline':
      return 'Saved locally';
    case 'conflict':
      return 'Conflict — reload required';
    case 'error':
      return 'Save failed';
    default:
      return 'Ready';
  }
}
