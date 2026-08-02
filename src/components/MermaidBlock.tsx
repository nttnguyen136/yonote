import mermaid from 'mermaid';
import { useEffect, useId, useState } from 'react';

export function MermaidBlock({ source, theme }: { source: string; theme: 'light' | 'dark' }) {
  const reactId = useId();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
    });

    setSvg('');
    void mermaid
      .render(id, source)
      .then(({ svg: output }) => {
        if (active) {
          setSvg(output);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setSvg('');
          setError(cause instanceof Error ? cause.message : 'Invalid Mermaid diagram.');
        }
      });

    return () => {
      active = false;
    };
  }, [reactId, source, theme]);

  if (error) return <div className="diagram-error">Mermaid: {error}</div>;
  if (!svg) return <div className="diagram-loading">Rendering Mermaid…</div>;

  return <div className="diagram mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
