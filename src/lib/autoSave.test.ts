import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_SAVE_STORAGE_KEY,
  DEFAULT_AUTO_SAVE,
  canManualSaveNote,
  loadAutoSavePreference,
  parseAutoSavePreference,
  resolveNoteSaveState,
  saveAutoSavePreference,
  saveLabel,
  shouldAutoFlushOnTransition,
  shouldScheduleAutoSave,
} from './autoSave.ts';
import type { StorageLike } from './offlineStorage.ts';

function createMemoryStorage(): StorageLike & { dump(): Map<string, string> } {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    dump() {
      return store;
    },
  };
}

test('autoSave preference defaults to false and persists in storage', () => {
  const storage = createMemoryStorage();
  assert.equal(DEFAULT_AUTO_SAVE, false);
  assert.equal(loadAutoSavePreference(storage), false);
  assert.equal(parseAutoSavePreference(null), false);
  assert.equal(parseAutoSavePreference('invalid'), false);

  assert.equal(saveAutoSavePreference(true, storage), true);
  assert.equal(storage.dump().get(AUTO_SAVE_STORAGE_KEY), 'true');
  assert.equal(loadAutoSavePreference(storage), true);

  assert.equal(saveAutoSavePreference(false, storage), true);
  assert.equal(storage.dump().get(AUTO_SAVE_STORAGE_KEY), 'false');
  assert.equal(loadAutoSavePreference(storage), false);
});

test('shouldScheduleAutoSave and shouldAutoFlushOnTransition require online mode, autoSave ON, and dirty selected note', () => {
  const dirtyIds = new Set<string>(['note-1']);

  assert.equal(shouldScheduleAutoSave('online', false, 'note-1', dirtyIds), false);
  assert.equal(shouldScheduleAutoSave('online', true, 'note-1', dirtyIds), true);
  assert.equal(shouldScheduleAutoSave('online', true, 'note-2', dirtyIds), false);
  assert.equal(shouldScheduleAutoSave('online', true, null, dirtyIds), false);
  assert.equal(shouldScheduleAutoSave('offline', true, 'note-1', dirtyIds), false);

  assert.equal(shouldAutoFlushOnTransition('online', false, 'note-1', dirtyIds), false);
  assert.equal(shouldAutoFlushOnTransition('online', true, 'note-1', dirtyIds), true);
  assert.equal(shouldAutoFlushOnTransition('offline', true, 'note-1', dirtyIds), false);
});

test('resolveNoteSaveState and canManualSaveNote reflect dirty and unsaved states accurately', () => {
  const dirtyIds = new Set<string>(['note-dirty']);

  assert.equal(resolveNoteSaveState('offline', 'note-dirty', dirtyIds), 'offline');
  assert.equal(resolveNoteSaveState('online', null, dirtyIds), 'idle');
  assert.equal(resolveNoteSaveState('online', 'note-dirty', dirtyIds), 'unsaved');
  assert.equal(resolveNoteSaveState('online', 'note-clean', dirtyIds), 'saved');

  assert.equal(canManualSaveNote('online', true, false, 'unsaved'), true);
  assert.equal(canManualSaveNote('online', true, false, 'error'), true);
  assert.equal(canManualSaveNote('online', true, false, 'conflict'), true);
  assert.equal(canManualSaveNote('online', true, false, 'saved'), false);
  assert.equal(canManualSaveNote('online', true, false, 'saving'), false);
  assert.equal(canManualSaveNote('online', true, true, 'unsaved'), false);
  assert.equal(canManualSaveNote('offline', true, false, 'unsaved'), false);
  assert.equal( saveLabel('unsaved'), 'Unsaved');
  assert.equal(saveLabel('saved'), 'Saved');
});
