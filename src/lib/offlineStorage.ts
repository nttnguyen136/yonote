import { DEFAULT_LIVE_MERMAID_SOURCE, DEFAULT_LIVE_UML_SOURCE } from './diagramDefaults.ts';
import { MAX_NOTE_TITLE_LENGTH } from './markdownImport.ts';
import type { Note } from './types.ts';

export const OFFLINE_WORKSPACE_STORAGE_KEY = 'yonote-offline-workspace-v1';

export type OfflineAppView = 'notes' | 'uml';

export interface OfflineWorkspaceState {
  isActive: boolean;
  appView: OfflineAppView;
  notes: Note[];
  selectedId: string | null;
  isViewOnly: boolean;
  liveUmlSource: string;
  liveMermaidSource: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const OFFLINE_STARTER = `# Private offline note

This workspace is **stored locally in your browser**:

- Nothing is loaded from or saved to D1.
- YONOTE does not call the notes API.
- Your notes and diagrams stay saved in this browser across refreshes and sessions.
- Export the note as Markdown anytime if you want a backup file.

\`\`\`mermaid
flowchart LR
  Browser --> Editor
  Editor --> Storage[Browser Storage]
  Storage -. no network .-> D1
\`\`\`

\`\`\`plantuml
@startuml
Browser -> PlantUML: Render locally
PlantUML --> Browser: SVG
@enduml
\`\`\`

PlantUML and Mermaid are rendered locally without sending diagram source to a server.
`;

const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown|txt)$/i;

export function createOfflineNote(
  title = 'Private offline note',
  content = OFFLINE_STARTER,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): Note {
  return {
    id,
    title,
    content,
    isPinned: false,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function deriveMarkdownFileTitle(fileName: string): string {
  const trimmedFileName = fileName.trim();
  const rawTitle = trimmedFileName.replace(MARKDOWN_EXTENSION_PATTERN, '').trim();
  return (rawTitle || 'Untitled note').slice(0, MAX_NOTE_TITLE_LENGTH);
}

export function importMarkdownIntoOfflineNotes(
  currentNotes: readonly Note[],
  fileName: string,
  content: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): {
  note: Note;
  notes: Note[];
  selectedId: string;
  isViewOnly: true;
} {
  const title = deriveMarkdownFileTitle(fileName);
  const note = createOfflineNote(title, content, now, id);
  const notes = [note, ...currentNotes];
  return {
    note,
    notes,
    selectedId: note.id,
    isViewOnly: true,
  };
}

export function createDefaultOfflineWorkspaceState(
  now = Date.now(),
  starterId: string = crypto.randomUUID(),
): OfflineWorkspaceState {
  const starter = createOfflineNote('Private offline note', OFFLINE_STARTER, now, starterId);
  return {
    isActive: false,
    appView: 'notes',
    notes: [starter],
    selectedId: starter.id,
    isViewOnly: false,
    liveUmlSource: DEFAULT_LIVE_UML_SOURCE,
    liveMermaidSource: DEFAULT_LIVE_MERMAID_SOURCE,
  };
}

function isValidNote(candidate: unknown): candidate is Note {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    typeof record.title === 'string' &&
    typeof record.content === 'string' &&
    typeof record.isPinned === 'boolean' &&
    typeof record.version === 'number' &&
    Number.isFinite(record.version) &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt) &&
    typeof record.updatedAt === 'number' &&
    Number.isFinite(record.updatedAt)
  );
}

export function parseOfflineWorkspaceState(
  raw: string | null,
  now = Date.now(),
  starterId?: string,
): OfflineWorkspaceState {
  if (!raw) {
    return createDefaultOfflineWorkspaceState(now, starterId);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return createDefaultOfflineWorkspaceState(now, starterId);
    }

    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.notes)) {
      return createDefaultOfflineWorkspaceState(now, starterId);
    }

    const notes = record.notes.filter(isValidNote).map((note) => ({
      id: note.id,
      title: note.title.slice(0, MAX_NOTE_TITLE_LENGTH),
      content: note.content,
      isPinned: note.isPinned,
      version: note.version,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }));

    const hasMatchingSelected =
      typeof record.selectedId === 'string' &&
      notes.some((note) => note.id === record.selectedId);
    const selectedId = hasMatchingSelected
      ? (record.selectedId as string)
      : (notes[0]?.id ?? null);

    return {
      isActive: record.isActive === true,
      appView: record.appView === 'uml' ? 'uml' : 'notes',
      notes,
      selectedId,
      isViewOnly: record.isViewOnly === true,
      liveUmlSource:
        typeof record.liveUmlSource === 'string'
          ? record.liveUmlSource
          : DEFAULT_LIVE_UML_SOURCE,
      liveMermaidSource:
        typeof record.liveMermaidSource === 'string'
          ? record.liveMermaidSource
          : DEFAULT_LIVE_MERMAID_SOURCE,
    };
  } catch {
    return createDefaultOfflineWorkspaceState(now, starterId);
  }
}

export function loadOfflineWorkspaceState(
  storage?: Pick<StorageLike, 'getItem'>,
  now = Date.now(),
): OfflineWorkspaceState {
  try {
    const targetStorage = storage ?? window.localStorage;
    const raw = targetStorage.getItem(OFFLINE_WORKSPACE_STORAGE_KEY);
    return parseOfflineWorkspaceState(raw, now);
  } catch {
    return createDefaultOfflineWorkspaceState(now);
  }
}

export function saveOfflineWorkspaceState(
  state: OfflineWorkspaceState,
  storage?: Pick<StorageLike, 'setItem'>,
): boolean {
  try {
    const targetStorage = storage ?? window.localStorage;
    targetStorage.setItem(OFFLINE_WORKSPACE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
