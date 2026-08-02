import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ThemePreference } from '../lib/types';
import { PlantUmlBlock } from './PlantUmlBlock';

const DEFAULT_SOURCE = `@startuml
title Live UML

actor User
participant "YONOTE PWA" as App
participant "Local PlantUML" as UML

User -> App: Edit diagram source
App -> UML: Render in browser
UML --> App: SVG
App --> User: Live preview

note over App,UML
  No API request
  No D1 write
  Source stays in memory
end note
@enduml`;

const TEMPLATES = {
  sequence: {
    label: 'Sequence',
    source: `@startuml
title Request flow

actor User
participant Browser
participant Worker
database D1

User -> Browser: Create note
Browser -> Worker: POST /api/notes
Worker -> D1: INSERT
D1 --> Worker: Success
Worker --> Browser: Note JSON
Browser --> User: Updated UI
@enduml`,
  },
  component: {
    label: 'Component',
    source: `@startuml
title YONOTE Architecture

package "Browser / PWA" {
  [React UI] as UI
  [Markdown Preview] as Markdown
  [Local PlantUML] as UML
  [Service Worker] as SW
}

cloud "Cloudflare" {
  [Worker API] as API
  database "D1" as DB
}

UI --> Markdown
UI --> UML
UI --> API : Online notes
API --> DB
SW ..> UI : Offline app shell
@enduml`,
  },
  class: {
    label: 'Class',
    source: `@startuml
title Note model

class Note {
  +id: string
  +title: string
  +content: string
  +isPinned: boolean
  +version: number
  +createdAt: number
  +updatedAt: number
}

class NoteRepository {
  +list(): Note[]
  +create(): Note
  +update(note: Note): Note
  +delete(id: string): void
}

NoteRepository --> Note
@enduml`,
  },
  activity: {
    label: 'Activity',
    source: `@startuml
title Private offline flow

start
:Open Live UML;
:Edit PlantUML source;
:Render locally in browser;

if (Export?) then (yes)
  :Download .puml or .svg;
else (no)
  :Keep source in memory;
endif

:Close or reload;
:Memory is cleared;
stop
@enduml`,
  },
} as const;

type TemplateKey = keyof typeof TEMPLATES;
type MobileView = 'editor' | 'preview';

interface LiveUmlWorkspaceProps {
  source: string;
  onSourceChange: (source: string) => void;
  theme: 'light' | 'dark';
  themePreference: ThemePreference;
  onTheme: () => void;
  onClose: () => void;
  canInstall: boolean;
  onInstall: () => Promise<void>;
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'diagram';
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function themeLabel(preference: ThemePreference): string {
  if (preference === 'system') return 'Theme: Auto';
  return preference === 'light' ? 'Theme: Light' : 'Theme: Dark';
}

export function LiveUmlWorkspace({
  source,
  onSourceChange,
  theme,
  themePreference,
  onTheme,
  onClose,
  canInstall,
  onInstall,
}: LiveUmlWorkspaceProps) {
  const [name, setName] = useState('live-diagram');
  const [renderSource, setRenderSource] = useState(source);
  const [renderedSvg, setRenderedSvg] = useState('');
  const [renderError, setRenderError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRenderedSvg('');
    setRenderError('');
    const timer = window.setTimeout(() => setRenderSource(source), 400);
    return () => window.clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    setRenderedSvg('');
    setRenderError('');
  }, [renderSource, theme]);

  useEffect(() => {
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      if (source === DEFAULT_SOURCE) return;
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [source]);

  const lines = useMemo(() => source.split(/\r?\n/).length, [source]);
  const characters = source.length;
  const previewStatus = renderError
    ? 'Render error'
    : renderSource !== source
      ? 'Waiting for changes…'
      : renderedSvg
        ? 'Up to date'
        : 'Rendering…';

  function applyTemplate(key: TemplateKey) {
    if (source !== DEFAULT_SOURCE && !window.confirm(`Replace the current source with the ${TEMPLATES[key].label} template?`)) {
      return;
    }
    onSourceChange(TEMPLATES[key].source);
    setName(`${key}-diagram`);
    setMobileView('editor');
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  }

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 500_000) {
      window.alert('PlantUML files are limited to 500 KB.');
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') return;
      onSourceChange(reader.result);
      setName(file.name.replace(/\.(?:puml|plantuml|txt)$/i, '') || 'diagram');
      setMobileView('editor');
    });
    reader.addEventListener('error', () => window.alert('Unable to read the selected file.'));
    reader.readAsText(file);
  }

  function reset() {
    if (source !== DEFAULT_SOURCE && !window.confirm('Clear the current Live UML source? Unsaved content will be lost.')) return;
    onSourceChange(DEFAULT_SOURCE);
    setName('live-diagram');
    setRenderedSvg('');
    setRenderError('');
  }

  return (
    <main className="live-uml-shell">
      <header className="topbar live-uml-topbar">
        <div className="brand">
          <span>Y</span> YONOTE
          <strong className="mode-badge live-uml-badge">LIVE UML</strong>
          <strong className="mode-badge">LOCAL · MEMORY ONLY</strong>
        </div>

        <nav className="live-uml-mobile-tabs" aria-label="Live UML views">
          <button className={mobileView === 'editor' ? 'active' : ''} onClick={() => setMobileView('editor')}>Source</button>
          <button className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>Preview</button>
        </nav>

        <div className="topbar-actions">
          {canInstall && <button className="ghost-button" onClick={() => void onInstall()}>Install</button>}
          <button className="ghost-button" type="button" onClick={onTheme}>{themeLabel(themePreference)}</button>
          <button className="ghost-button" type="button" onClick={onClose}>Back</button>
        </div>
      </header>

      <div className="live-uml-banner">
        PlantUML is rendered inside this device. Source is not sent to an API or saved to D1. Export before closing or reloading.
      </div>

      <section className="live-uml-toolbar">
        <label className="live-uml-name">
          <span>Name</span>
          <input value={name} maxLength={120} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} aria-label="Diagram name" />
        </label>

        <label className="live-uml-template">
          <span>Template</span>
          <select defaultValue="" onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            if (!event.target.value) return;
            applyTemplate(event.target.value as TemplateKey);
            event.target.value = '';
          }}>
            <option value="" disabled>Choose…</option>
            {Object.entries(TEMPLATES).map(([key, template]) => (
              <option key={key} value={key}>{template.label}</option>
            ))}
          </select>
        </label>

        <div className="live-uml-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".puml,.plantuml,.txt,text/plain"
            onChange={importFile}
          />
          <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>Import</button>
          <button className="ghost-button" onClick={() => void copySource()}>
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
          </button>
          <button className="ghost-button" onClick={() => downloadBlob(source, 'text/plain;charset=utf-8', `${safeFilename(name)}.puml`)}>
            Export .puml
          </button>
          <button
            className="ghost-button"
            disabled={!renderedSvg || Boolean(renderError)}
            onClick={() => downloadBlob(renderedSvg, 'image/svg+xml;charset=utf-8', `${safeFilename(name)}.svg`)}
          >
            Export SVG
          </button>
          <button className="icon-button danger" onClick={reset}>Reset</button>
        </div>
      </section>

      <section className="live-uml-workspace">
        <div className={`live-uml-editor-panel ${mobileView === 'editor' ? 'mobile-active' : ''}`}>
          <div className="live-uml-panel-heading">
            <strong>PlantUML source</strong>
            <span>{lines} lines · {characters} characters</span>
          </div>
          <textarea
            className="live-uml-editor"
            value={source}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onSourceChange(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="PlantUML source"
          />
        </div>

        <div className={`live-uml-preview-panel ${mobileView === 'preview' ? 'mobile-active' : ''}`}>
          <div className="live-uml-panel-heading">
            <strong>Live preview</strong>
            <span>{previewStatus}</span>
          </div>
          <div className="live-uml-preview-canvas">
            {renderSource.trim() ? (
              <PlantUmlBlock
                source={renderSource}
                theme={theme}
                onRendered={(svg) => {
                  setRenderedSvg(svg);
                  setRenderError('');
                }}
                onError={(message) => {
                  setRenderedSvg('');
                  setRenderError(message);
                }}
              />
            ) : (
              <div className="empty-workspace"><p>Enter PlantUML source to render a diagram.</p></div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export { DEFAULT_SOURCE as DEFAULT_LIVE_UML_SOURCE };
