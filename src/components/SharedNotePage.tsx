import { useEffect, useState } from 'react';
import { ApiError, getSharedNote } from '../lib/api';
import type { SharedNote } from '../lib/api';
import type { ThemePreference } from '../lib/types';
import { MarkdownPreview } from './MarkdownPreview';
import { ThemeSelect } from './ThemeSelect';
import { getDiagramTheme, getThemeColor, isThemePreference, resolveTheme } from '../lib/theme';

function getInitialTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem('yonote-theme');
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function useSharedTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getInitialTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getThemeColor(resolvedTheme));
    try {
      window.localStorage.setItem('yonote-theme', preference);
    } catch {
      // The shared page still uses the selected theme for this session.
    }
  }, [diagramTheme, preference, resolvedTheme]);

  return { preference, diagramTheme, setPreference };
}

export function SharedNotePage({ shareId }: { shareId: string }) {
  const [note, setNote] = useState<SharedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { preference, diagramTheme, setPreference } = useSharedTheme();

  useEffect(() => {
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdRobots = !robots;
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex, nofollow, noarchive';

    return () => {
      if (createdRobots) robots?.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getSharedNote(shareId)
      .then((sharedNote) => {
        if (cancelled) return;
        setNote(sharedNote);
        document.title = `${sharedNote.title} · YONOTE`;
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiError && cause.status === 404
            ? 'This share link is invalid or has been revoked.'
            : cause instanceof Error
              ? cause.message
              : 'Unable to load the shared note.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  return (
    <main className="shared-note-page">
      <header className="shared-note-header">
        <a className="brand shared-note-brand" href="/" aria-label="Open YONOTE">
          <span>Y</span>
          <div>
            <strong>YONOTE</strong>
            <small>Shared note</small>
          </div>
        </a>
        <div className="shared-note-actions">
          <ThemeSelect compact value={preference} onChange={setPreference} />
          <a className="ghost-button shared-home-link" href="/">Open YONOTE</a>
        </div>
      </header>

      <div className="shared-note-container">
        {loading && (
          <div className="shared-note-state">
            <span className="empty-workspace-icon" aria-hidden="true">…</span>
            <h1>Loading shared note</h1>
          </div>
        )}

        {!loading && error && (
          <div className="shared-note-state">
            <span className="empty-workspace-icon" aria-hidden="true">◇</span>
            <h1>Shared note unavailable</h1>
            <p>{error}</p>
            <a className="primary-button shared-home-link" href="/">Go to YONOTE</a>
          </div>
        )}

        {!loading && note && (
          <article className="shared-note-document">
            <header className="shared-note-title">
              <span className="section-label">Read-only shared note</span>
              <h1>{note.title}</h1>
              <time dateTime={new Date(note.updatedAt).toISOString()}>
                Updated {new Date(note.updatedAt).toLocaleString()}
              </time>
            </header>
            <div className="shared-note-content">
              <MarkdownPreview content={note.content} theme={diagramTheme} />
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
