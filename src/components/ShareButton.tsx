import { useRef, useState } from 'react';
import type { Note } from '../lib/types';
import { createNoteShare, getNoteShare, revokeNoteShare } from '../lib/api';
import type { NoteShare } from '../lib/api';

function buildShareUrl(shareId: string): string {
  return new URL(`/share/${shareId}`, window.location.origin).toString();
}

export function ShareButton({
  token,
  note,
  onBeforeOpen,
}: {
  token: string;
  note: Note;
  onBeforeOpen: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<NoteShare | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const shareUrl = share ? buildShareUrl(share.shareId) : '';

  async function openDialog() {
    setOpen(true);
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      await onBeforeOpen();
      setShare(await getNoteShare(token, note.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load sharing settings.');
    } finally {
      setLoading(false);
    }
  }

  async function enableSharing() {
    setLoading(true);
    setError('');
    try {
      setShare(await createNoteShare(token, note.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create a share link.');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      linkRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function revokeSharing() {
    if (!window.confirm('Revoke this public link? Anyone using it will lose access immediately.')) return;
    setLoading(true);
    setError('');
    try {
      await revokeNoteShare(token, note.id);
      setShare(null);
      setCopied(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke the share link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="icon-button" type="button" title="Share note" onClick={() => void openDialog()}>
        Share
      </button>

      {open && (
        <div className="share-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="share-dialog-heading">
              <div>
                <span className="section-label">Public access</span>
                <h2 id="share-dialog-title">Share “{note.title || 'Untitled note'}”</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close share dialog" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <p className="share-dialog-description">
              Anyone with the link can read the latest saved version. They cannot edit the note.
            </p>

            {loading && <div className="share-dialog-status">Loading sharing settings…</div>}
            {error && <div className="form-error" role="alert">{error}</div>}

            {!loading && !share && (
              <div className="share-dialog-empty">
                <strong>This note is private.</strong>
                <p>Create a random public link. You can revoke it at any time.</p>
                <button className="primary-button" type="button" onClick={() => void enableSharing()}>
                  Create public link
                </button>
              </div>
            )}

            {!loading && share && (
              <div className="share-dialog-active">
                <label className="field-label" htmlFor="share-note-link">Public link</label>
                <div className="share-link-row">
                  <input id="share-note-link" ref={linkRef} value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                  <button className="primary-button" type="button" onClick={() => void copyLink()}>
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
                <div className="share-dialog-footer">
                  <span>Created {new Date(share.createdAt).toLocaleString()}</span>
                  <button className="ghost-button share-revoke-button" type="button" onClick={() => void revokeSharing()}>
                    Revoke link
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
