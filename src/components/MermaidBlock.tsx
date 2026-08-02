import mermaid from 'mermaid';
import { useEffect, useId, useState } from 'react';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'dark',
});

export function MermaidBlock({ source }: { source: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;

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
  }, [reactId, source]);

  if (error) return <div className="diagram-error">Mermaid: {error}</div>;
  if (!svg) return <div className="diagram-loading">Rendering Mermaid…</div>;

  return <div className="diagram mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
