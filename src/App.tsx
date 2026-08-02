import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { ApiError, createNote, deleteNote, listNotes, unlock, updateNote } from './lib/api';
import type { Note, SaveState, ThemePreference, WorkspaceMode } from './lib/types';
import { MarkdownPreview } from './components/MarkdownPreview';
import { ShareButton } from './components/ShareButton';
import { ThemeSelect } from './components/ThemeSelect';
import { DEFAULT_LIVE_MERMAID_SOURCE, DEFAULT_LIVE_UML_SOURCE, LiveUmlWorkspace } from './components/LiveUmlWorkspace';
import { getDiagramTheme, getThemeColor, isThemePreference, resolveTheme } from './lib/theme';

type MobileView = 'notes' | 'editor' | 'preview';
type AppView = 'notes' | 'uml';

const LAYOUT_STORAGE_KEY = 'yonote-layout-v1';
const DEFAULT_EDITOR_RATIO = 50;
const MIN_EDITOR_RATIO = 25;
const MAX_EDITOR_RATIO = 75;

interface StoredLayout {
  sidebarCollapsed: boolean;
  editorRatio: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getInitialLayout(): StoredLayout {
  try {
    const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!stored) {
      return { sidebarCollapsed: false, editorRatio: DEFAULT_EDITOR_RATIO };
    }

    const parsed = JSON.parse(stored) as Partial<StoredLayout>;
    return {
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      editorRatio:
        typeof parsed.editorRatio === 'number' && Number.isFinite(parsed.editorRatio)
          ? clamp(parsed.editorRatio, MIN_EDITOR_RATIO, MAX_EDITOR_RATIO)
          : DEFAULT_EDITOR_RATIO,
    };
  } catch {
    return { sidebarCollapsed: false, editorRatio: DEFAULT_EDITOR_RATIO };
  }
}

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
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getInitialTheme);
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme = resolveTheme(preference, systemDark);
  const diagramTheme = getDiagramTheme(resolvedTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = diagramTheme;
    try {
      window.localStorage.setItem('yonote-theme', preference);
    } catch {
      // Appearance still works for the current session when storage is unavailable.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getThemeColor(resolvedTheme));
  }, [diagramTheme, preference, resolvedTheme]);

  return { preference, resolvedTheme, diagramTheme, setPreference };
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

function UnlockScreen({
  onUnlock,
  onOffline,
  theme,
  onThemeChange,
  canInstall,
  onInstall,
}: {
  onUnlock: (key: string) => Promise<void>;
  onOffline: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
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
      <header className="unlock-header">
        <div className="brand brand-large">
          <span>Y</span>
          <div>
            <strong>YONOTE</strong>
            <small>Notes and diagrams</small>
          </div>
        </div>
        <div className="unlock-tools">
          {canInstall && (
            <button className="ghost-button" type="button" onClick={() => void onInstall()}>
              Install app
            </button>
          )}
          <ThemeSelect value={theme} onChange={onThemeChange} />
        </div>
      </header>

      <section className="unlock-layout">
        <div className="unlock-intro">
          <span className="eyebrow">Private · Fast · Installable</span>
          <h1>Write clearly.<br /><span>Think visually.</span></h1>
          <p>
            A focused Markdown workspace with local Mermaid and PlantUML rendering,
            designed for both cloud notes and private offline sessions.
          </p>
          <div className="feature-pills" aria-label="YONOTE features">
            <span>Markdown</span>
            <span>Mermaid</span>
            <span>PlantUML</span>
            <span>PWA offline</span>
          </div>
        </div>

        <form className="unlock-card" onSubmit={submit}>
          <div className="unlock-card-heading">
            <span className="section-label">Cloud workspace</span>
            <h2>Open your notes</h2>
            <p>Enter your access key. The key and session token stay out of browser storage.</p>
          </div>

          <label className="field-label" htmlFor="access-key">Access key</label>
          <input
            id="access-key"
            type="password"
            value={key}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setKey(event.target.value)}
            autoComplete="current-password"
            autoFocus
            maxLength={512}
            placeholder="Enter access key"
          />
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button unlock-submit" type="submit" disabled={!key || submitting}>
            {submitting ? 'Opening workspace…' : 'Open cloud notes'}
          </button>

          <div className="unlock-divider"><span>Private workspace</span></div>
          <button className="offline-workspace-button" type="button" onClick={onOffline}>
            <span className="offline-workspace-icon" aria-hidden="true">◎</span>
            <span>
              <strong>Open Private Offline Mode</strong>
              <small>RAM-only notes and live diagrams. Nothing is sent to D1.</small>
            </span>
            <span className="offline-workspace-arrow" aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>('locked');
  const [appView, setAppView] = useState<AppView>('notes');
  const [liveUmlSource, setLiveUmlSource] = useState(DEFAULT_LIVE_UML_SOURCE);
  const [liveMermaidSource, setLiveMermaidSource] = useState(DEFAULT_LIVE_MERMAID_SOURCE);
  const [token, setToken] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [mobileView, setMobileView] = useState<MobileView>('notes');
  const [editSignal, setEditSignal] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getInitialLayout().sidebarCollapsed,
  );
  const [editorRatio, setEditorRatio] = useState(
    () => getInitialLayout().editorRatio,
  );
  const { preference: themePreference, diagramTheme, setPreference: setThemePreference } = useTheme();
  const { canInstall, install } = useInstallPrompt();

  const notesRef = useRef(notes);
  const selectedIdRef = useRef(selectedId);
  const dirtyIdsRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isOfflineMode = mode === 'offline';

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          sidebarCollapsed,
          editorRatio: Math.round(editorRatio * 10) / 10,
        } satisfies StoredLayout),
      );
    } catch {
      // Layout still works for the current session when storage is unavailable.
    }
  }, [editorRatio, sidebarCollapsed]);

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
    setAppView('notes');
    setLiveUmlSource(DEFAULT_LIVE_UML_SOURCE);
    setLiveMermaidSource(DEFAULT_LIVE_MERMAID_SOURCE);
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

  function startPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || window.matchMedia('(max-width: 900px)').matches) return;

    const workspace = workspaceRef.current;
    if (!workspace) return;

    const workspaceRect = workspace.getBoundingClientRect();
    const sidebar = workspace.querySelector<HTMLElement>('.sidebar');
    const sidebarWidth = sidebarCollapsed ? 0 : (sidebar?.getBoundingClientRect().width ?? 0);
    const separatorWidth = event.currentTarget.getBoundingClientRect().width;
    const availableWidth = workspaceRect.width - sidebarWidth - separatorWidth;
    if (availableWidth <= 0) return;

    const contentLeft = workspaceRect.left + sidebarWidth;
    const paneMinimum = 280;
    const dynamicMinimum = Math.max(
      MIN_EDITOR_RATIO,
      (paneMinimum / availableWidth) * 100,
    );
    const dynamicMaximum = Math.min(
      MAX_EDITOR_RATIO,
      100 - (paneMinimum / availableWidth) * 100,
    );

    function updateRatio(clientX: number) {
      const nextRatio = ((clientX - contentLeft) / availableWidth) * 100;
      setEditorRatio(clamp(nextRatio, dynamicMinimum, dynamicMaximum));
    }

    function finishResize() {
      window.removeEventListener('pointermove', moveResize);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      document.body.classList.remove('yonote-resizing');
    }

    function moveResize(pointerEvent: PointerEvent) {
      updateRatio(pointerEvent.clientX);
    }

    event.preventDefault();
    document.body.classList.add('yonote-resizing');
    updateRatio(event.clientX);
    window.addEventListener('pointermove', moveResize);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  }

  function handlePanelResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextRatio: number | null = null;

    if (event.key === 'ArrowLeft') nextRatio = editorRatio - 2;
    if (event.key === 'ArrowRight') nextRatio = editorRatio + 2;
    if (event.key === 'Home') nextRatio = MIN_EDITOR_RATIO;
    if (event.key === 'End') nextRatio = MAX_EDITOR_RATIO;

    if (nextRatio === null) return;
    event.preventDefault();
    setEditorRatio(clamp(nextRatio, MIN_EDITOR_RATIO, MAX_EDITOR_RATIO));
  }

  async function performUnlock(key: string) {
    setAppView('notes');
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
    setAppView('notes');
    setLiveUmlSource(DEFAULT_LIVE_UML_SOURCE);
    setLiveMermaidSource(DEFAULT_LIVE_MERMAID_SOURCE);
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

  if (mode === 'offline' && appView === 'uml') {
    return (
      <LiveUmlWorkspace
        plantUmlSource={liveUmlSource}
        onPlantUmlSourceChange={setLiveUmlSource}
        mermaidSource={liveMermaidSource}
        onMermaidSourceChange={setLiveMermaidSource}
        theme={diagramTheme}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
        onClose={() => setAppView('notes')}
        onExit={lock}
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
        theme={themePreference}
        onThemeChange={setThemePreference}
        canInstall={canInstall}
        onInstall={install}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span>Y</span>
          <div className="brand-copy">
            <strong>YONOTE</strong>
            <small>{isOfflineMode ? 'Private workspace' : 'Cloud workspace'}</small>
          </div>
        </div>

        <div className="topbar-context">
          {isOfflineMode ? (
            <nav className="workspace-switcher" aria-label="Private workspace tools">
              <button type="button" className="active" aria-current="page">Offline Notes</button>
              <button type="button" onClick={() => setAppView('uml')}>Live Diagram</button>
            </nav>
          ) : (
            <span className="cloud-context"><span aria-hidden="true">●</span> Cloud notes</span>
          )}
        </div>

        <nav className="mobile-tabs" aria-label="Note workspace views">
          <button type="button" className={mobileView === 'notes' ? 'active' : ''} onClick={() => setMobileView('notes')}>Notes</button>
          <button type="button" className={mobileView === 'editor' ? 'active' : ''} disabled={!selectedNote} onClick={() => setMobileView('editor')}>Edit</button>
          <button type="button" className={mobileView === 'preview' ? 'active' : ''} disabled={!selectedNote} onClick={() => setMobileView('preview')}>Preview</button>
        </nav>

        <div className="topbar-actions">
          <span className={`save-state save-${saveState}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            {saveLabel(saveState)}
          </span>
          {canInstall && <button className="ghost-button quiet" type="button" onClick={() => void install()}>Install</button>}
          <ThemeSelect compact value={themePreference} onChange={setThemePreference} />
          <button className="ghost-button" type="button" onClick={lock}>{isOfflineMode ? 'Exit' : 'Lock'}</button>
        </div>
      </header>

      {isOfflineMode && (
        <div className="offline-banner">
          <span className="offline-banner-icon" aria-hidden="true">◎</span>
          <span><strong>Private Offline Mode</strong> · Notes and diagrams stay in memory only. Export before leaving.</span>
        </div>
      )}
      {globalError && <div className="global-error" role="alert">{globalError}</div>}

      <div
        ref={workspaceRef}
        className={`workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        style={
          {
            '--editor-grow': editorRatio,
            '--preview-grow': 100 - editorRatio,
          } as CSSProperties
        }
      >
        {sidebarCollapsed && (
          <div className="sidebar-restore-rail">
            <button
              className="sidebar-restore-button"
              type="button"
              aria-label="Show notes sidebar"
              title="Show notes sidebar"
              onClick={() => setSidebarCollapsed(false)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}

        <aside className={`sidebar ${mobileView === 'notes' ? 'mobile-active' : ''}`}>
          <div className="sidebar-heading">
            <div>
              <span className="section-label">Workspace</span>
              <strong>Notes</strong>
            </div>
            <span className="sidebar-heading-actions">
              <span className="count-badge" aria-label={`${notes.length} notes`}>{notes.length}</span>
              <button className="primary-button compact" type="button" onClick={() => void addNote()}>New note</button>
              <button
                className="sidebar-collapse-button"
                type="button"
                aria-label="Hide notes sidebar"
                title="Hide notes sidebar"
                onClick={() => setSidebarCollapsed(true)}
              >
                <span aria-hidden="true">‹</span>
              </button>
            </span>
          </div>

          <div className="sidebar-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search title or content"
              aria-label="Search notes"
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearch('')}>×</button>
            )}
          </div>

          <div className="note-list">
            {loading && <div className="empty-state"><span className="empty-state-icon">…</span><strong>Loading notes</strong></div>}
            {!loading && filteredNotes.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-icon" aria-hidden="true">◇</span>
                <strong>{notes.length ? 'No results' : 'No notes yet'}</strong>
                <p>{notes.length ? 'Try a different search term.' : 'Create your first note to begin.'}</p>
                {!notes.length && <button className="ghost-button" type="button" onClick={() => void addNote()}>Create note</button>}
              </div>
            )}
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={`note-item ${note.id === selectedId ? 'selected' : ''}`}
                aria-current={note.id === selectedId ? 'page' : undefined}
                onClick={() => selectNote(note.id)}
              >
                <div className="note-title-row">
                  <strong>{note.title || 'Untitled note'}</strong>
                  {note.isPinned && <span className="pin-indicator" title="Pinned" aria-label="Pinned">◆</span>}
                </div>
                <p>{note.content.replace(/[#>*_`\[\]]/g, '').slice(0, 100) || 'Empty note'}</p>
                <time dateTime={new Date(note.updatedAt).toISOString()}>{formatDate(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        </aside>

        <section className={`editor-panel ${mobileView === 'editor' ? 'mobile-active' : ''}`} aria-label="Markdown editor">
          {selectedNote ? (
            <>
              <div className="document-toolbar">
                <div className="document-title-field">
                  <label className="section-label" htmlFor="note-title-input">Note title</label>
                  <span className="title-input-wrap">
                    <input
                      id="note-title-input"
                      ref={titleInputRef}
                      className="title-input"
                      value={selectedNote.title}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => editSelected({ title: event.target.value })}
                      aria-label="Note title"
                      maxLength={200}
                    />
                    {selectedNote.title && (
                      <button
                        className="title-clear-button"
                        type="button"
                        aria-label="Clear note title"
                        title="Clear title"
                        onClick={() => {
                          editSelected({ title: '' });
                          titleInputRef.current?.focus();
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                </div>
                <div className="document-actions" aria-label="Note actions">
                  <button className="icon-button" type="button" title={selectedNote.isPinned ? 'Unpin note' : 'Pin note'} onClick={() => editSelected({ isPinned: !selectedNote.isPinned })}>
                    {selectedNote.isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  {!isOfflineMode && token && (
                    <ShareButton
                      key={selectedNote.id}
                      token={token}
                      note={selectedNote}
                      onBeforeOpen={() => flushSave(selectedNote.id)}
                    />
                  )}
                  <button className="icon-button" type="button" title="Export Markdown" onClick={downloadSelected}>Export</button>
                  <button className="icon-button danger" type="button" title="Delete note" onClick={() => void removeSelected()}>Delete</button>
                </div>
              </div>
              <div className="panel-heading editor-heading">
                <strong>Markdown</strong>
                <span><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd> to save</span>
              </div>
              <textarea
                className="markdown-editor"
                value={selectedNote.content}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => editSelected({ content: event.target.value })}
                placeholder={'# Start writing\n\n```mermaid\nflowchart LR\n  A --> B\n```'}
                spellCheck
                aria-label="Markdown content"
              />
            </>
          ) : (
            <div className="empty-workspace">
              <span className="empty-workspace-icon" aria-hidden="true">✦</span>
              <h2>No note selected</h2>
              <p>Create a note or choose one from the sidebar.</p>
              <button className="primary-button" type="button" onClick={() => void addNote()}>Create note</button>
            </div>
          )}
        </section>

        <div
          className="workspace-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize editor and preview"
          aria-orientation="vertical"
          aria-valuemin={MIN_EDITOR_RATIO}
          aria-valuemax={MAX_EDITOR_RATIO}
          aria-valuenow={Math.round(editorRatio)}
          aria-valuetext={`Editor ${Math.round(editorRatio)}%, preview ${Math.round(100 - editorRatio)}%`}
          title="Drag to resize. Double-click to reset."
          onPointerDown={startPanelResize}
          onKeyDown={handlePanelResizeKeyDown}
          onDoubleClick={() => setEditorRatio(DEFAULT_EDITOR_RATIO)}
        >
          <span aria-hidden="true" />
        </div>

        <section className={`preview-panel ${mobileView === 'preview' ? 'mobile-active' : ''}`} aria-label="Markdown preview">
          <div className="panel-heading preview-heading">
            <strong>Preview</strong>
            <span>Markdown · Mermaid · PlantUML</span>
          </div>
          <div className="preview-scroll">
            {selectedNote ? (
              <MarkdownPreview content={selectedNote.content} theme={diagramTheme} />
            ) : (
              <div className="empty-workspace">
                <span className="empty-workspace-icon" aria-hidden="true">◫</span>
                <p>Preview will appear here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );

}
