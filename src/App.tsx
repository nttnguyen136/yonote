import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, createNote, deleteNote, listNotes, unlock, updateNote } from './lib/api';
import type { Note, SaveState } from './lib/types';
import { MarkdownPreview } from './components/MarkdownPreview';

type MobileView = 'notes' | 'editor' | 'preview';

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function saveLabel(state: SaveState): string {
  switch (state) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'conflict':
      return 'Conflict — reload required';
    case 'error':
      return 'Save failed';
    default:
      return 'Ready';
  }
}

function UnlockScreen({ onUnlock }: { onUnlock: (key: string) => Promise<void> }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key) return;
    setSubmitting(true);
    setError('');
    try {
      await onUnlock(key);
      setKey('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to unlock YONOTE.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="unlock-page">
      <form className="unlock-card" onSubmit={submit}>
        <div className="brand-mark">Y</div>
        <h1>YONOTE</h1>
        <p>Enter the access key for this session.</p>
        <label htmlFor="access-key">Access key</label>
        <input
          id="access-key"
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoComplete="current-password"
          autoFocus
          maxLength={512}
        />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={!key || submitting}>
          {submitting ? 'Unlocking…' : 'Unlock'}
        </button>
        <small>The key and session token are not stored in the browser.</small>
      </form>
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [mobileView, setMobileView] = useState<MobileView>('notes');
  const [editSignal, setEditSignal] = useState(0);

  const notesRef = useRef(notes);
  const selectedIdRef = useRef(selectedId);
  const dirtyIdsRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const lock = useCallback(() => {
    setToken(null);
    setNotes([]);
    setSelectedId(null);
    setSearch('');
    setGlobalError('');
    setSaveState('idle');
    dirtyIdsRef.current.clear();
    inFlightRef.current.clear();
  }, []);

  const handleApiFailure = useCallback(
    (cause: unknown, fallback: string) => {
      if (cause instanceof ApiError && cause.status === 401) {
        lock();
        return 'Session expired. Enter the key again.';
      }
      return cause instanceof Error ? cause.message : fallback;
    },
    [lock],
  );

  const flushSave = useCallback(
    async (id: string) => {
      if (!token || inFlightRef.current.has(id) || !dirtyIdsRef.current.has(id)) return;
      const snapshot = notesRef.current.find((note) => note.id === id);
      if (!snapshot) return;

      dirtyIdsRef.current.delete(id);
      inFlightRef.current.add(id);
      if (selectedIdRef.current === id) setSaveState('saving');

      try {
        const saved = await updateNote(token, snapshot);
        const latest = notesRef.current.find((note) => note.id === id);
        const changedWhileSaving = Boolean(
          latest &&
            (latest.title !== snapshot.title ||
              latest.content !== snapshot.content ||
              latest.isPinned !== snapshot.isPinned),
        );

        setNotes((currentNotes) =>
          currentNotes.map((current) => {
            if (current.id !== id) return current;
            if (!changedWhileSaving) return saved;
            return {
              ...current,
              version: saved.version,
              createdAt: saved.createdAt,
              updatedAt: saved.updatedAt,
            };
          }),
        );

        if (changedWhileSaving) dirtyIdsRef.current.add(id);
        if (selectedIdRef.current === id) setSaveState(changedWhileSaving ? 'idle' : 'saved');
      } catch (cause) {
        dirtyIdsRef.current.add(id);
        if (selectedIdRef.current === id) {
          setSaveState(cause instanceof ApiError && cause.status === 409 ? 'conflict' : 'error');
          setGlobalError(handleApiFailure(cause, 'Unable to save the note.'));
        }
      } finally {
        inFlightRef.current.delete(id);
        if (dirtyIdsRef.current.has(id)) setEditSignal((value) => value + 1);
      }
    },
    [handleApiFailure, token],
  );

  useEffect(() => {
    if (!selectedId || !dirtyIdsRef.current.has(selectedId)) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushSave(selectedId), 800);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [editSignal, flushSave, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (selectedIdRef.current) void flushSave(selectedIdRef.current);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushSave]);

  async function performUnlock(key: string) {
    const nextToken = await unlock(key);
    setToken(nextToken);
    setLoading(true);
    setGlobalError('');
    try {
      const loaded = await listNotes(nextToken);
      setNotes(loaded);
      setSelectedId(loaded[0]?.id ?? null);
      setMobileView(loaded.length ? 'editor' : 'notes');
    } catch (cause) {
      setToken(null);
      throw cause;
    } finally {
      setLoading(false);
    }
  }

  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return notes;
    return notes.filter(
      (note) =>
        note.title.toLocaleLowerCase().includes(query) ||
        note.content.toLocaleLowerCase().includes(query),
    );
  }, [notes, search]);

  function editSelected(patch: Partial<Pick<Note, 'title' | 'content' | 'isPinned'>>) {
    if (!selectedId) return;
    setNotes((current) => current.map((note) => (note.id === selectedId ? { ...note, ...patch } : note)));
    dirtyIdsRef.current.add(selectedId);
    setSaveState('idle');
    setGlobalError('');
    setEditSignal((value) => value + 1);
  }

  function selectNote(id: string) {
    if (selectedId && dirtyIdsRef.current.has(selectedId)) void flushSave(selectedId);
    setSelectedId(id);
    setSaveState(dirtyIdsRef.current.has(id) ? 'idle' : 'saved');
    setGlobalError('');
    setMobileView('editor');
  }

  async function addNote() {
    if (!token) return;
    if (selectedId && dirtyIdsRef.current.has(selectedId)) void flushSave(selectedId);
    setGlobalError('');
    try {
      const note = await createNote(token);
      setNotes((current) => [note, ...current]);
      setSelectedId(note.id);
      setSaveState('saved');
      setMobileView('editor');
    } catch (cause) {
      setGlobalError(handleApiFailure(cause, 'Unable to create a note.'));
    }
  }

  async function removeSelected() {
    if (!token || !selectedNote) return;
    if (!window.confirm(`Delete “${selectedNote.title}”?`)) return;

    try {
      await deleteNote(token, selectedNote.id);
      dirtyIdsRef.current.delete(selectedNote.id);
      const remaining = notes.filter((note) => note.id !== selectedNote.id);
      setNotes(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setSaveState('idle');
      setMobileView(remaining.length ? 'editor' : 'notes');
    } catch (cause) {
      setGlobalError(handleApiFailure(cause, 'Unable to delete the note.'));
    }
  }

  function downloadSelected() {
    if (!selectedNote) return;
    const blob = new Blob([selectedNote.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const filename = selectedNote.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'note';
    anchor.href = url;
    anchor.download = `${filename}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!token) return <UnlockScreen onUnlock={performUnlock} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span>Y</span> YONOTE</div>
        <nav className="mobile-tabs" aria-label="Mobile workspace views">
          <button className={mobileView === 'notes' ? 'active' : ''} onClick={() => setMobileView('notes')}>Notes</button>
          <button className={mobileView === 'editor' ? 'active' : ''} disabled={!selectedNote} onClick={() => setMobileView('editor')}>Edit</button>
          <button className={mobileView === 'preview' ? 'active' : ''} disabled={!selectedNote} onClick={() => setMobileView('preview')}>Preview</button>
        </nav>
        <div className="topbar-actions">
          <span className={`save-state save-${saveState}`}>{saveLabel(saveState)}</span>
          <button className="ghost-button" onClick={lock}>Lock</button>
        </div>
      </header>

      {globalError && <div className="global-error">{globalError}</div>}

      <div className="workspace">
        <aside className={`sidebar ${mobileView === 'notes' ? 'mobile-active' : ''}`}>
          <div className="sidebar-toolbar">
            <input
              type="search"
              placeholder="Search notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="primary-button compact" onClick={() => void addNote()}>+ New</button>
          </div>

          <div className="note-list">
            {loading && <div className="empty-state">Loading notes…</div>}
            {!loading && filteredNotes.length === 0 && (
              <div className="empty-state">{notes.length ? 'No matching notes.' : 'No notes yet.'}</div>
            )}
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                className={`note-item ${note.id === selectedId ? 'selected' : ''}`}
                onClick={() => selectNote(note.id)}
              >
                <div className="note-title-row">
                  <strong>{note.title || 'Untitled note'}</strong>
                  {note.isPinned && <span title="Pinned">◆</span>}
                </div>
                <p>{note.content.replace(/[#>*_`\[\]]/g, '').slice(0, 100) || 'Empty note'}</p>
                <time>{formatDate(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        </aside>

        <section className={`editor-panel ${mobileView === 'editor' ? 'mobile-active' : ''}`}>
          {selectedNote ? (
            <>
              <div className="document-toolbar">
                <input
                  className="title-input"
                  value={selectedNote.title}
                  onChange={(event) => editSelected({ title: event.target.value })}
                  aria-label="Note title"
                  maxLength={200}
                />
                <div className="document-actions">
                  <button className="icon-button" onClick={() => editSelected({ isPinned: !selectedNote.isPinned })}>
                    {selectedNote.isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button className="icon-button" onClick={downloadSelected}>Export</button>
                  <button className="icon-button danger" onClick={() => void removeSelected()}>Delete</button>
                </div>
              </div>
              <textarea
                className="markdown-editor"
                value={selectedNote.content}
                onChange={(event) => editSelected({ content: event.target.value })}
                placeholder={'# Start writing\n\n```mermaid\nflowchart LR\n  A --> B\n```'}
                spellCheck
              />
            </>
          ) : (
            <div className="empty-workspace">
              <h2>No note selected</h2>
              <p>Create a note to start writing.</p>
              <button className="primary-button" onClick={() => void addNote()}>Create note</button>
            </div>
          )}
        </section>

        <section className={`preview-panel ${mobileView === 'preview' ? 'mobile-active' : ''}`}>
          {selectedNote ? (
            <MarkdownPreview content={selectedNote.content} token={token} />
          ) : (
            <div className="empty-workspace"><p>Preview will appear here.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
