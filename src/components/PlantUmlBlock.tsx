import { useEffect, useRef, useState } from 'react';

const RENDER_TIMEOUT_MS = 15_000;
const PLANTUML_MODULE_URL = '/plantuml/plantuml.js';
const RENDER_HOST_ID = 'yonote-plantuml-render-host';

type RenderState = 'loading' | 'ready' | 'error';

interface PlantUmlModule {
  render(lines: string[], targetId: string, options?: { dark?: boolean }): void;
}

let vizPromise: Promise<void> | null = null;
let enginePromise: Promise<PlantUmlModule> | null = null;
let renderQueue: Promise<void> = Promise.resolve();

function hasForbiddenDirective(source: string): boolean {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    const include = trimmed.match(/^!include\b\s+(.+)$/i);
    if (include) return !/^<[^>]+>$/.test(include[1].trim());
    return /^!(?:include\w*|import)\b/i.test(trimmed);
  });
}

function loadViz(): Promise<void> {
  if (vizPromise) return vizPromise;

  vizPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-plantuml-viz]');
    if (existing) {
      if (existing.dataset.failed === 'true') {
        existing.remove();
        vizPromise = null;
        return loadViz().then(resolve, reject);
      }
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => {
        existing.dataset.failed = 'true';
        reject(new Error('Unable to load the local Graphviz engine.'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = '/plantuml/viz-global.js';
    script.async = true;
    script.dataset.plantumlViz = 'true';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      script.dataset.failed = 'true';
      script.remove();
      reject(new Error('Unable to load the local Graphviz engine.'));
    }, { once: true });
    document.head.appendChild(script);
  }).catch((cause) => {
    vizPromise = null;
    throw cause;
  });

  return vizPromise!;
}

async function loadEngine(): Promise<PlantUmlModule> {
  await loadViz();
  enginePromise ??= (import(/* @vite-ignore */ PLANTUML_MODULE_URL) as Promise<PlantUmlModule>).catch((cause) => {
    enginePromise = null;
    throw cause;
  });
  return enginePromise!;
}

function getRenderHost(): HTMLDivElement {
  const existing = document.getElementById(RENDER_HOST_ID);
  if (existing instanceof HTMLDivElement) return existing;

  const host = document.createElement('div');
  host.id = RENDER_HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  document.body.appendChild(host);
  return host;
}

function sanitizeSvg(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement;

  clone.querySelectorAll('script, foreignObject, iframe, object, embed, image').forEach((node) => node.remove());
  const elements: Element[] = [clone, ...clone.querySelectorAll('*')];
  elements.forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
        element.removeAttribute(attribute.name);
      }
      if (/url\s*\(\s*['"]?(?!#)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  clone.querySelectorAll('style').forEach((style) => {
    const css = style.textContent ?? '';
    if (/@import|url\s*\(\s*['"]?(?!#)/i.test(css)) style.remove();
  });

  clone.setAttribute('role', 'img');
  clone.setAttribute('aria-label', 'PlantUML diagram');
  return new XMLSerializer().serializeToString(clone);
}

async function executeRender(source: string, dark: boolean): Promise<string> {
  const { render } = await loadEngine();
  const host = getRenderHost();
  host.replaceChildren();

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      action();
    };

    const observer = new MutationObserver(() => {
      const svg = host.querySelector('svg');
      if (svg) {
        finish(() => resolve(sanitizeSvg(svg)));
        return;
      }

      const message = host.textContent?.trim();
      if (message) finish(() => reject(new Error(message)));
    });
    observer.observe(host, { childList: true, subtree: true, characterData: true });

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error('PlantUML rendering timed out on this device.')));
    }, RENDER_TIMEOUT_MS);

    try {
      render(source.split(/\r?\n/), RENDER_HOST_ID, { dark });
    } catch (cause) {
      finish(() => reject(cause instanceof Error ? cause : new Error('PlantUML rendering failed.')));
    }
  });
}

function renderPlantUmlLocally(source: string, dark: boolean): Promise<string> {
  const task = renderQueue.then(
    () => executeRender(source, dark),
    () => executeRender(source, dark),
  );
  renderQueue = task.then(() => undefined, () => undefined);
  return task;
}

export function PlantUmlBlock({
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
  const [state, setState] = useState<RenderState>('loading');
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const onRenderedRef = useRef(onRendered);
  const onErrorRef = useRef(onError);
  onRenderedRef.current = onRendered;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    if (hasForbiddenDirective(source)) {
      setUrl('');
      setState('error');
      const message = 'External file/URL include and import directives are disabled. Internal standard-library includes such as <C4/...> are allowed.';
      setError(message);
      onErrorRef.current?.(message);
      return;
    }

    setState('loading');
    setError('');

    void renderPlantUmlLocally(source, theme === 'dark')
      .then((svg) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setUrl(objectUrl);
        setState('ready');
        onRenderedRef.current?.(svg);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setUrl('');
        const message = cause instanceof Error ? cause.message : 'PlantUML rendering failed.';
        setError(message);
        setState('error');
        onErrorRef.current?.(message);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, theme]);

  return (
    <div className="diagram plantuml-diagram">
      {state === 'loading' && <div className="diagram-loading">Rendering PlantUML locally…</div>}
      {state === 'error' && <div className="diagram-error">PlantUML: {error}</div>}
      {state === 'ready' && url && <img src={url} alt="PlantUML diagram" />}
    </div>
  );
}
