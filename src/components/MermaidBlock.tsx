import mermaid from 'mermaid';
import { useEffect, useId, useRef, useState } from 'react';

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
  const onRenderedRef = useRef(onRendered);
  const onErrorRef = useRef(onError);
  onRenderedRef.current = onRendered;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
    });

    setSvg('');
    setError('');
    void mermaid
      .render(id, source)
      .then(({ svg: output }) => {
        if (!active) return;
        setSvg(output);
        setError('');
        onRenderedRef.current?.(output);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : 'Invalid Mermaid diagram.';
        setSvg('');
        setError(message);
        onErrorRef.current?.(message);
      });

    return () => {
      active = false;
    };
  }, [reactId, source, theme]);

  if (error) return <div className="diagram-error">Mermaid: {error}</div>;
  if (!svg) return <div className="diagram-loading">Rendering Mermaid…</div>;

  return <div className="diagram mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
