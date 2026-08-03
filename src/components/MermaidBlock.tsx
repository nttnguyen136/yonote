import { useEffect, useId, useRef, useState } from 'react';

type MermaidApi = typeof import('mermaid')['default'];

let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid')
    .then((module) => module.default)
    .catch((cause) => {
      mermaidPromise = null;
      throw cause;
    });
  return mermaidPromise;
}

interface MermaidParseError extends Error {
  str?: string;
  hash?: {
    loc?: {
      first_line?: number;
      first_column?: number;
    };
  };
}

function normalizeMermaidSource(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/^```(?:mermaid)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function formatMermaidError(cause: unknown): string {
  const error = cause as Partial<MermaidParseError> | null;
  const raw = error?.str || error?.message || 'Invalid Mermaid diagram.';
  const lines = raw
    .replace(/^Error:\s*/i, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s/.test(line))
    .slice(0, 10);

  const line = error?.hash?.loc?.first_line;
  const column = error?.hash?.loc?.first_column;
  const location = typeof line === 'number'
    ? `Line ${line}${typeof column === 'number' ? `, column ${column + 1}` : ''}: `
    : '';

  return `${location}${lines.join('\n').trim() || 'Invalid Mermaid diagram.'}`;
}

export function MermaidBlock({
  source,
  theme,
  onRendered,
  onError,
}: {
  source: string;
  theme: 'light' | 'dark';
  onRendered?: (svg: string) => void;
  onError?: (message: string) => void;
}) {
  const reactId = useId();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const onRenderedRef = useRef(onRendered);
  const onErrorRef = useRef(onError);
  onRenderedRef.current = onRendered;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
    const normalizedSource = normalizeMermaidSource(source);

    setError('');
    setRendering(true);

    async function renderDiagram() {
      try {
        if (!normalizedSource) throw new Error('Diagram source is empty.');
        const mermaid = await loadMermaid();
        if (!active) return;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
        });

        // Validate first. Calling render() directly can return Mermaid's large
        // built-in "Syntax error in text" SVG instead of a useful UI error.
        await mermaid.parse(normalizedSource);
        const { svg: output } = await mermaid.render(id, normalizedSource);

        if (!active) return;
        setSvg(output);
        setError('');
        onRenderedRef.current?.(output);
      } catch (cause: unknown) {
        if (!active) return;
        const message = formatMermaidError(cause);
        // Preserve the last valid SVG while showing the new syntax error.
        setError(message);
        onErrorRef.current?.(message);
      } finally {
        if (active) setRendering(false);
      }
    }

    void renderDiagram();

    return () => {
      active = false;
    };
  }, [reactId, source, theme]);

  return (
    <>
      {error && (
        <div className="diagram-error mermaid-error" role="alert">
          <strong>Mermaid syntax error</strong>
          <pre>{error}</pre>
          <small>Use raw Mermaid source. Markdown code fences are accepted and removed automatically.</small>
        </div>
      )}
      {rendering && svg && <div className="diagram-loading compact">Updating Mermaid preview…</div>}
      {!svg && !error && <div className="diagram-loading">Rendering Mermaid…</div>}
      {svg && <div className="diagram mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />}
    </>
  );
}
