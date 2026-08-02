import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, createNote, deleteNote, listNotes, unlock, updateNote } from './lib/api';
import type { Note, SaveState, ThemePreference, WorkspaceMode } from './lib/types';
import { MarkdownPreview } from './components/MarkdownPreview';
import { DEFAULT_LIVE_UML_SOURCE, LiveUmlWorkspace } from './components/LiveUmlWorkspace';

type MobileView = 'notes' | 'editor' | 'preview';
type AppView = 'notes' | 'uml';
type ResolvedTheme = 'light' | 'dark';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const OFFLINE_STARTER = `# Private offline note

This workspace is **memory-only**:

- Nothing is loaded from or saved to D1.
- YONOTE does not call the notes API.
- Your note disappears when you close, refresh, lock, or leave offline mode.
- Export the note as Markdown before leaving if you want to keep it.

\`\`\`mermaid
flowchart LR
  Browser --> Editor
  Editor --> Memory
  Memory -. no network .-> D1
\`\`\`

\`\`\`plantuml
@startuml
Browser -> PlantUML: Render locally
PlantUML --> Browser: SVG
@enduml
\`\`\`

PlantUML and Mermaid are rendered locally without sending diagram source to a server.
`;

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
    case 'offline':
      return 'Memory only';
    case 'conflict':
      return 'Conflict — reload required';
    case 'error':
      return 'Save failed';
    default:
      return 'Ready';
  }
}

function createOfflineNote(title = 'Private offline note', content = OFFLINE_STARTER): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    content,
    isPinned: false,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function getInitialTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem('yonote-theme');
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getInitialTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const resolvedTheme: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    try {
      window.localStorage.setItem('yonote-theme', preference);
    } catch {
      // Theme still works for the current session when storage is unavailable.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      resolvedTheme === 'dark' ? '#0d1117' : '#f6f8fa',
    );
  }, [preference, resolvedTheme]);

  function cycleTheme() {
    setPreference((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'));
  }

  return { preference, resolvedTheme, cycleTheme };
}

function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  return { canInstall: Boolean(promptEvent) && !installed, install };
}

function ThemeButton({ preference, onClick }: { preference: ThemePreference; onClick: () => void }) {
  const label = preference === 'system' ? 'Theme: Auto' : preference === 'light' ? 'Theme: Light' : 'Theme: Dark';
  return (
    <button className="ghost-button" type="button" onClick={onClick} title="Cycle system, light and dark theme">
      {label}
    </button>
  );
}

function UnlockScreen({
  onUnlock,
  onOffline,
  onLiveUml,
  theme,
  onTheme,
  canInstall,
  onInstall,
}: {
  onUnlock: (key: string) => Promise<void>;
  onOffline: () => void;
  onLiveUml: () => void;
  theme: ThemePreference;
  onTheme: () => void;
  canInstall: boolean;
  onInstall: () => Promise<void>;
}) {
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
      <div className="unlock-tools">
        <ThemeButton preference={theme} onClick={onTheme} />
        {canInstall && <button className="ghost-button" onClick={() => void onInstall()}>Install app</button>}
      </div>
      <form className="unlock-card" onSubmit={submit}>
        <div className="brand-mark">Y</div>
        <h1>YONOTE</h1>
        <p>Enter the access key to open your cloud notes.</p>
        <label htmlFor="access-key">Access key</label>
        <input
          id="access-key"
          type="password"
          value={key}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setKey(event.target.value)}
          autoComplete="current-password"
          autoFocus
          maxLength={512}
        />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={!key || submitting}>
          {submitting ? 'Unlocking…' : 'Unlock cloud notes'}
        </button>
        <div className="unlock-divider"><span>or</span></div>
        <button className="offline-button" type="button" onClick={onOffline}>
          Open private offline notes
        </button>
        <button className="live-uml-button" type="button" onClick={onLiveUml}>
          Open Live UML
        </button>
        <small>
          Offline notes and Live UML make no notes API requests. Memory-only content is cleared when the app closes or reloads.
        </small>
      </form>
    </main>
  );
}

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>('locked');
  const [appView, setAppView] = useState<AppView>('notes');
  const [liveUmlSource, setLiveUmlSource] = useState(DEFAULT_LIVE_UML_SOURCE);
  const [token, setToken] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [mobileView, setMobileView] = useState<MobileView>('notes');
  const [editSignal, setEditSignal] = useState(0);
  const { preference: themePreference, resolvedTheme, cycleTheme } = useTheme();
  const { canInstall, install } = useInstallPrompt();

  const notesRef = useRef(notes);
  const selectedIdRef = useRef(selectedId);
  const dirtyIdsRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);
  const isOfflineMode = mode === 'offline';

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!isOfflineMode) return;
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [isOfflineMode]);

  const lock = useCallback(() => {
    setMode('locked');
    setToken(null);
    setNotes([]);
    setSelectedId(null);
    setSearch('');
    setGlobalError('');
    setSaveState('idle');
    dirtyIdsRef.current.clear();
    inFlightRef.current.clear();
    if (timerRef.current) window.clearTimeout(timerRef.current);
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
      if (mode !== 'online' || !token || inFlightRef.current.has(id) || !dirtyIdsRef.current.has(id)) return;
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
    [handleApiFailure, mode, token],
  );

  useEffect(() => {
    if (mode !== 'online' || !selectedId || !dirtyIdsRef.current.has(selectedId)) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushSave(selectedId), 800);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [editSignal, flushSave, mode, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (mode === 'online' && selectedIdRef.current) void flushSave(selectedIdRef.current);
        if (mode === 'offline') setSaveState('offline');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushSave, mode]);

  async function performUnlock(key: string) {
    const nextToken = await unlock(key);
    setToken(nextToken);
    setMode('online');
    setLoading(true);
    setGlobalError('');
    try {
      const loaded = await listNotes(nextToken);
      setNotes(loaded);
      setSelectedId(loaded[0]?.id ?? null);
      setSaveState(loaded.length ? 'saved' : 'idle');
      setMobileView(loaded.length ? 'editor' : 'notes');
    } catch (cause) {
      setToken(null);
      setMode('locked');
      throw cause;
    } finally {
      setLoading(false);
    }
  }

  function startOfflineMode() {
    const note = createOfflineNote();
    setMode('offline');
    setToken(null);
    setNotes([note]);
    setSelectedId(note.id);
    setSearch('');
    setGlobalError('');
    setSaveState('offline');
    setMobileView('editor');
    dirtyIdsRef.current.clear();
    inFlightRef.current.clear();
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
    const now = Date.now();
    setNotes((current) =>
      current.map((note) => (note.id === selectedId ? { ...note, ...patch, updatedAt: now } : note)),
    );
    setGlobalError('');

    if (isOfflineMode) {
      setSaveState('offline');
      return;
    }

    dirtyIdsRef.current.add(selectedId);
    setSaveState('idle');
    setEditSignal((value) => value + 1);
  }

  function selectNote(id: string) {
    if (mode === 'online' && selectedId && dirtyIdsRef.current.has(selectedId)) void flushSave(selectedId);
    setSelectedId(id);
    setSaveState(isOfflineMode ? 'offline' : dirtyIdsRef.current.has(id) ? 'idle' : 'saved');
    setGlobalError('');
    setMobileView('editor');
  }

  async function addNote() {
    if (isOfflineMode) {
      const note = createOfflineNote('Untitled offline note', '');
      setNotes((current) => [note, ...current]);
      setSelectedId(note.id);
      setSaveState('offline');
      setMobileView('editor');
      return;
    }

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
    if (!selectedNote) return;
    if (!window.confirm(`Delete “${selectedNote.title}”?`)) return;

    if (isOfflineMode) {
      const remaining = notes.filter((note) => note.id !== selectedNote.id);
      setNotes(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setSaveState('offline');
      setMobileView(remaining.length ? 'editor' : 'notes');
      return;
    }

    if (!token) return;
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

  if (appView === 'uml') {
    return (
      <LiveUmlWorkspace
        source={liveUmlSource}
        onSourceChange={setLiveUmlSource}
        theme={resolvedTheme}
        themePreference={themePreference}
        onTheme={cycleTheme}
        onClose={() => setAppView('notes')}
        canInstall={canInstall}
        onInstall={install}
      />
    );
  }

  if (mode === 'locked') {
    return (
      <UnlockScreen
        onUnlock={performUnlock}
        onOffline={startOfflineMode}
        onLiveUml={() => setAppView('uml')}
        theme={themePreference}
        onTheme={cycleTheme}
        canInstall={canInstall}
        onInstall={install}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span>Y</span> YONOTE
          {isOfflineMode && <strong className="mode-badge">PRIVATE OFFLINE</strong>}
        </div>
        <nav className="mobile-tabs" aria-label="Mobile workspace views">
          <button className={mobileView === 'notes' ? 'active' : ''} onClick={() => setMobileView('notes')}>Notes</button>
          <button className={mobileView === 'editor' ? 'active' : ''} disabled={!selectedNote} onClick={() => setMobileView('editor')}>Edit</button>
          <button className={mobileView === 'preview' ? 'active' : ''} disabled={!selectedNote} onClick={() => setMobileView('preview')}>Preview</button>
        </nav>
        <div className="topbar-actions">
          <span className={`save-state save-${saveState}`}>{saveLabel(saveState)}</span>
          {canInstall && <button className="ghost-button" onClick={() => void install()}>Install</button>}
          <button className="ghost-button" onClick={() => setAppView('uml')}>Live UML</button>
          <ThemeButton preference={themePreference} onClick={cycleTheme} />
          <button className="ghost-button" onClick={lock}>{isOfflineMode ? 'Exit' : 'Lock'}</button>
        </div>
      </header>

      {isOfflineMode && (
        <div className="offline-banner">
          Private offline session: note content stays in memory only. No notes API or D1 calls. Mermaid and PlantUML render locally. Export before closing.
        </div>
      )}
      {globalError && <div className="global-error">{globalError}</div>}

      <div className="workspace">
        <aside className={`sidebar ${mobileView === 'notes' ? 'mobile-active' : ''}`}>
          <div className="sidebar-toolbar">
            <input
              type="search"
              placeholder="Search notes…"
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
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
                  onChange={(event: ChangeEvent<HTMLInputElement>) => editSelected({ title: event.target.value })}
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
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => editSelected({ content: event.target.value })}
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
            <MarkdownPreview
              content={selectedNote.content}
              theme={resolvedTheme}
            />
          ) : (
            <div className="empty-workspace"><p>Preview will appear here.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
