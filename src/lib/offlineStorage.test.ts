import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OFFLINE_WORKSPACE_STORAGE_KEY,
  createDefaultOfflineWorkspaceState,
  createOfflineNote,
  importMarkdownIntoOfflineNotes,
  loadOfflineWorkspaceState,
  parseOfflineWorkspaceState,
  saveOfflineWorkspaceState,
} from './offlineStorage.ts';
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

test('createDefaultOfflineWorkspaceState initializes starter note and inactive state', () => {
  const state = createDefaultOfflineWorkspaceState(1700000000000, 'starter-1');
  assert.equal(state.isActive, false);
  assert.equal(state.appView, 'notes');
  assert.equal(state.isViewOnly, false);
  assert.equal(state.notes.length, 1);
  assert.equal(state.notes[0]?.id, 'starter-1');
  assert.equal(state.selectedId, 'starter-1');
  assert.equal(state.notes[0]?.title, 'Private offline note');
});

test('importMarkdownIntoOfflineNotes creates a new offline note in view-only mode and selects it', () => {
  const existing = createOfflineNote('Existing note', 'Old content', 1700000000000, 'note-1');
  const imported = importMarkdownIntoOfflineNotes(
    [existing],
    '  Architecture Guide.md ',
    '# Architecture\n\nSaved offline',
    1700000005000,
    'note-2',
  );

  assert.equal(imported.isViewOnly, true);
  assert.equal(imported.selectedId, 'note-2');
  assert.equal(imported.note.title, 'Architecture Guide');
  assert.equal(imported.note.content, '# Architecture\n\nSaved offline');
  assert.equal(imported.notes.length, 2);
  assert.equal(imported.notes[0]?.id, 'note-2');
  assert.equal(imported.notes[1]?.id, 'note-1');
});

test('saveOfflineWorkspaceState and loadOfflineWorkspaceState persist across F5 / reload and Exit', () => {
  const storage = createMemoryStorage();
  const initial = createDefaultOfflineWorkspaceState(1700000000000, 'starter-1');
  const imported = importMarkdownIntoOfflineNotes(
    initial.notes,
    'roadmap.markdown',
    '# Roadmap 2026',
    1700000001000,
    'imported-1',
  );

  const activeState = {
    ...initial,
    isActive: true,
    notes: imported.notes,
    selectedId: imported.selectedId,
    isViewOnly: imported.isViewOnly,
    liveUmlSource: '@startuml\nA -> B\n@enduml',
    liveMermaidSource: 'flowchart TD\nA --> B',
  };

  assert.equal(saveOfflineWorkspaceState(activeState, storage), true);
  assert.equal(storage.dump().has(OFFLINE_WORKSPACE_STORAGE_KEY), true);

  // Simulating F5 reload while in Offline Mode
  const afterRefresh = loadOfflineWorkspaceState(storage, 1700000002000);
  assert.equal(afterRefresh.isActive, true);
  assert.equal(afterRefresh.isViewOnly, true);
  assert.equal(afterRefresh.selectedId, 'imported-1');
  assert.equal(afterRefresh.notes.length, 2);
  assert.equal(afterRefresh.notes[0]?.title, 'roadmap');
  assert.equal(afterRefresh.notes[0]?.content, '# Roadmap 2026');
  assert.equal(afterRefresh.liveUmlSource, '@startuml\nA -> B\n@enduml');
  assert.equal(afterRefresh.liveMermaidSource, 'flowchart TD\nA --> B');

  // Simulating clicking Exit (isActive becomes false, but notes & diagrams remain saved)
  assert.equal(
    saveOfflineWorkspaceState({ ...afterRefresh, isActive: false }, storage),
    true,
  );
  const afterExit = loadOfflineWorkspaceState(storage, 1700000003000);
  assert.equal(afterExit.isActive, false);
  assert.equal(afterExit.notes.length, 2);
  assert.equal(afterExit.selectedId, 'imported-1');
  assert.equal(afterExit.isViewOnly, true);
});

test('parseOfflineWorkspaceState preserves empty notes list when user deletes all notes', () => {
  const raw = JSON.stringify({
    isActive: true,
    appView: 'notes',
    notes: [],
    selectedId: null,
    isViewOnly: false,
    liveUmlSource: '@startuml\n@enduml',
    liveMermaidSource: 'flowchart LR',
  });

  const parsed = parseOfflineWorkspaceState(raw, 1700000000000, 'starter-unused');
  assert.equal(parsed.isActive, true);
  assert.deepEqual(parsed.notes, []);
  assert.equal(parsed.selectedId, null);
});

test('parseOfflineWorkspaceState recovers gracefully from corrupted JSON or missing selectedId', () => {
  const fallback = parseOfflineWorkspaceState('{bad json', 1700000000000, 'starter-fallback');
  assert.equal(fallback.isActive, false);
  assert.equal(fallback.notes.length, 1);
  assert.equal(fallback.selectedId, 'starter-fallback');

  const note = createOfflineNote('Valid note', 'Body', 1700000000000, 'valid-1');
  const mismatchedSelection = parseOfflineWorkspaceState(
    JSON.stringify({
      isActive: true,
      appView: 'uml',
      notes: [note, { invalid: true }],
      selectedId: 'non-existent-id',
      isViewOnly: true,
    }),
    1700000000000,
  );
  assert.equal(mismatchedSelection.appView, 'uml');
  assert.equal(mismatchedSelection.notes.length, 1);
  assert.equal(mismatchedSelection.selectedId, 'valid-1');
  assert.equal(mismatchedSelection.isViewOnly, true);
});
