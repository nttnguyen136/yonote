import { useEffect, useState } from 'react';
import { renderPlantUml } from '../lib/api';

export function PlantUmlBlock({ source, token }: { source: string; token: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    void renderPlantUml(token, source)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) {
          setUrl('');
          setError(cause instanceof Error ? cause.message : 'PlantUML rendering failed.');
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, token]);

  if (error) return <div className="diagram-error">PlantUML: {error}</div>;
  if (!url) return <div className="diagram-loading">Rendering PlantUML…</div>;

  return <img className="diagram plantuml-diagram" src={url} alt="PlantUML diagram" />;
}
