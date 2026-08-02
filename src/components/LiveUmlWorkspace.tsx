import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ThemePreference } from '../lib/types';
import { MermaidBlock } from './MermaidBlock';
import { PlantUmlBlock } from './PlantUmlBlock';

export type DiagramLanguage = 'plantuml' | 'mermaid';

const DEFAULT_PLANTUML_SOURCE = `@startuml
title Live PlantUML

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

const DEFAULT_MERMAID_SOURCE = `flowchart LR
  User[User] --> Editor[Live Mermaid editor]
  Editor --> Renderer[Local Mermaid renderer]
  Renderer --> Preview[Live SVG preview]
  Editor -. no API request .-> Memory[(Browser RAM)]`;

interface DiagramTemplate {
  label: string;
  source: string;
}

const PLANTUML_TEMPLATES: Record<string, DiagramTemplate> = {
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
:Open Private Offline Mode;
:Switch to Live Diagram;
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
};

const MERMAID_TEMPLATES: Record<string, DiagramTemplate> = {
  flowchart: {
    label: 'Flowchart',
    source: `flowchart TD
  Start([Start]) --> Edit[Edit Mermaid source]
  Edit --> Render[Render locally]
  Render --> Valid{Valid syntax?}
  Valid -- Yes --> Preview[Show SVG preview]
  Valid -- No --> Error[Show error]
  Preview --> Export[Export .mmd or .svg]`,
  },
  sequence: {
    label: 'Sequence',
    source: `sequenceDiagram
  actor User
  participant App as YONOTE PWA
  participant Mermaid as Local Mermaid

  User->>App: Edit diagram source
  App->>Mermaid: Render in browser
  Mermaid-->>App: SVG
  App-->>User: Live preview`,
  },
  class: {
    label: 'Class',
    source: `classDiagram
  class Note {
    +string id
    +string title
    +string content
    +boolean isPinned
    +number version
  }

  class NoteRepository {
    +list() Note[]
    +create() Note
    +update(Note note) Note
    +delete(string id)
  }

  NoteRepository --> Note`,
  },
  state: {
    label: 'State',
    source: `stateDiagram-v2
  [*] --> Locked
  Locked --> Online: Enter access key
  Locked --> OfflineNotes: Open Private Offline Mode
  OfflineNotes --> LiveDiagram: Open Live Diagram
  LiveDiagram --> OfflineNotes: Offline Notes
  Online --> Locked: Lock
  OfflineNotes --> Locked: Exit
  LiveDiagram --> Locked: Exit`,
  },
};

type MobileView = 'editor' | 'preview';

interface LiveUmlWorkspaceProps {
  plantUmlSource: string;
  onPlantUmlSourceChange: (source: string) => void;
  mermaidSource: string;
  onMermaidSourceChange: (source: string) => void;
  theme: 'light' | 'dark';
  themePreference: ThemePreference;
  onTheme: () => void;
  onClose: () => void;
  onExit: () => void;
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

function defaultName(language: DiagramLanguage): string {
  return language === 'plantuml' ? 'plantuml-diagram' : 'mermaid-diagram';
}

export function LiveUmlWorkspace({
  plantUmlSource,
  onPlantUmlSourceChange,
  mermaidSource,
  onMermaidSourceChange,
  theme,
  themePreference,
  onTheme,
  onClose,
  onExit,
  canInstall,
  onInstall,
}: LiveUmlWorkspaceProps) {
  const [language, setLanguage] = useState<DiagramLanguage>('plantuml');
  const [names, setNames] = useState<Record<DiagramLanguage, string>>({
    plantuml: defaultName('plantuml'),
    mermaid: defaultName('mermaid'),
  });
  const [renderSource, setRenderSource] = useState(plantUmlSource);
  const [renderedSvg, setRenderedSvg] = useState('');
  const [renderError, setRenderError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const source = language === 'plantuml' ? plantUmlSource : mermaidSource;
  const onSourceChange = language === 'plantuml' ? onPlantUmlSourceChange : onMermaidSourceChange;
  const defaultSource = language === 'plantuml' ? DEFAULT_PLANTUML_SOURCE : DEFAULT_MERMAID_SOURCE;
  const templates = language === 'plantuml' ? PLANTUML_TEMPLATES : MERMAID_TEMPLATES;
  const name = names[language];
  const languageLabel = language === 'plantuml' ? 'PlantUML' : 'Mermaid';
  const sourceExtension = language === 'plantuml' ? 'puml' : 'mmd';

  useEffect(() => {
    setRenderedSvg('');
    setRenderError('');
    setRenderSource('');
    const timer = window.setTimeout(() => setRenderSource(source), 400);
    return () => window.clearTimeout(timer);
  }, [language, source]);

  useEffect(() => {
    setRenderedSvg('');
    setRenderError('');
  }, [renderSource, theme]);

  useEffect(() => {
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      const hasChanges = plantUmlSource !== DEFAULT_PLANTUML_SOURCE || mermaidSource !== DEFAULT_MERMAID_SOURCE;
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [mermaidSource, plantUmlSource]);

  const lines = useMemo(() => source.split(/\r?\n/).length, [source]);
  const characters = source.length;
  const previewStatus = renderError
    ? 'Render error'
    : !renderSource || renderSource !== source
      ? 'Waiting for changes…'
      : renderedSvg
        ? 'Up to date'
        : 'Rendering…';

  function setCurrentName(value: string) {
    setNames((current) => ({ ...current, [language]: value }));
  }

  function changeLanguage(nextLanguage: DiagramLanguage) {
    setLanguage(nextLanguage);
    setMobileView('editor');
    setRenderedSvg('');
    setRenderError('');
  }

  function applyTemplate(key: string) {
    const template = templates[key];
    if (!template) return;
    if (source !== defaultSource && !window.confirm(`Replace the current source with the ${template.label} template?`)) {
      return;
    }
    onSourceChange(template.source);
    setCurrentName(`${key}-diagram`);
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
      window.alert('Diagram source files are limited to 500 KB.');
      return;
    }

    const importedLanguage: DiagramLanguage = /\.(?:mmd|mermaid)$/i.test(file.name)
      ? 'mermaid'
      : /\.(?:puml|plantuml)$/i.test(file.name)
        ? 'plantuml'
        : language;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') return;
      if (importedLanguage === 'plantuml') onPlantUmlSourceChange(reader.result);
      else onMermaidSourceChange(reader.result);
      setNames((current) => ({
        ...current,
        [importedLanguage]: file.name.replace(/\.(?:puml|plantuml|mmd|mermaid|txt)$/i, '') || defaultName(importedLanguage),
      }));
      setLanguage(importedLanguage);
      setMobileView('editor');
    });
    reader.addEventListener('error', () => window.alert('Unable to read the selected file.'));
    reader.readAsText(file);
  }

  function reset() {
    if (source !== defaultSource && !window.confirm(`Reset the current ${languageLabel} source? Unsaved content will be lost.`)) return;
    onSourceChange(defaultSource);
    setCurrentName(defaultName(language));
    setRenderedSvg('');
    setRenderError('');
  }

  return (
    <main className="live-uml-shell">
      <header className="topbar live-uml-topbar">
        <div className="brand">
          <span>Y</span> YONOTE
          <strong className="mode-badge">PRIVATE OFFLINE</strong>
          <strong className="mode-badge live-uml-badge">LIVE DIAGRAM</strong>
        </div>

        <nav className="live-uml-mobile-tabs" aria-label="Live Diagram views">
          <button className={mobileView === 'editor' ? 'active' : ''} onClick={() => setMobileView('editor')}>Source</button>
          <button className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>Preview</button>
        </nav>

        <div className="topbar-actions">
          {canInstall && <button className="ghost-button" onClick={() => void onInstall()}>Install</button>}
          <button className="ghost-button" type="button" onClick={onTheme}>{themeLabel(themePreference)}</button>
          <button className="ghost-button" type="button" onClick={onClose}>Offline Notes</button>
          <button className="ghost-button" type="button" onClick={onExit}>Exit</button>
        </div>
      </header>

      <div className="live-uml-banner">
        Offline tool: PlantUML and Mermaid are rendered on this device and kept only in RAM. Source is never sent to an API or saved to D1.
      </div>

      <nav className="live-diagram-language-tabs" aria-label="Diagram language">
        <button
          type="button"
          className={language === 'plantuml' ? 'active' : ''}
          aria-pressed={language === 'plantuml'}
          onClick={() => changeLanguage('plantuml')}
        >
          PlantUML
        </button>
        <button
          type="button"
          className={language === 'mermaid' ? 'active' : ''}
          aria-pressed={language === 'mermaid'}
          onClick={() => changeLanguage('mermaid')}
        >
          Mermaid
        </button>
      </nav>

      <section className="live-uml-toolbar">
        <label className="live-uml-name">
          <span>Name</span>
          <input value={name} maxLength={120} onChange={(event: ChangeEvent<HTMLInputElement>) => setCurrentName(event.target.value)} aria-label="Diagram name" />
        </label>

        <label className="live-uml-template">
          <span>{languageLabel} template</span>
          <select key={language} defaultValue="" onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            if (!event.target.value) return;
            applyTemplate(event.target.value);
            event.target.value = '';
          }}>
            <option value="" disabled>Choose…</option>
            {Object.entries(templates).map(([key, template]) => (
              <option key={key} value={key}>{template.label}</option>
            ))}
          </select>
        </label>

        <div className="live-uml-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".puml,.plantuml,.mmd,.mermaid,.txt,text/plain"
            onChange={importFile}
          />
          <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>Import</button>
          <button className="ghost-button" onClick={() => void copySource()}>
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
          </button>
          <button className="ghost-button" onClick={() => downloadBlob(source, 'text/plain;charset=utf-8', `${safeFilename(name)}.${sourceExtension}`)}>
            Export .{sourceExtension}
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
            <strong>{languageLabel} source</strong>
            <span>{lines} lines · {characters} characters</span>
          </div>
          <textarea
            className="live-uml-editor"
            value={source}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onSourceChange(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={`${languageLabel} source`}
          />
        </div>

        <div className={`live-uml-preview-panel ${mobileView === 'preview' ? 'mobile-active' : ''}`}>
          <div className="live-uml-panel-heading">
            <strong>Live preview · {languageLabel}</strong>
            <span>{previewStatus}</span>
          </div>
          <div className="live-uml-preview-canvas">
            {renderSource.trim() ? (
              language === 'plantuml' ? (
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
                <MermaidBlock
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
              )
            ) : (
              <div className="empty-workspace"><p>Enter {languageLabel} source to render a diagram.</p></div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export {
  DEFAULT_PLANTUML_SOURCE as DEFAULT_LIVE_UML_SOURCE,
  DEFAULT_MERMAID_SOURCE as DEFAULT_LIVE_MERMAID_SOURCE,
};
