import type { Note } from './types';

export interface NoteShare {
  shareId: string;
  createdAt: number;
}

export interface SharedNote {
  title: string;
  content: string;
  updatedAt: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Keep the generic error message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function unlock(key: string): Promise<string> {
  const result = await request<{ token: string }>('/api/unlock', null, {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
  return result.token;
}

export async function listNotes(token: string): Promise<Note[]> {
  const result = await request<{ notes: Note[] }>('/api/notes', token);
  return result.notes;
}

export async function createNote(token: string): Promise<Note> {
  const result = await request<{ note: Note }>('/api/notes', token, {
    method: 'POST',
    body: JSON.stringify({ title: 'Untitled note', content: '' }),
  });
  return result.note;
}

export async function updateNote(token: string, note: Note): Promise<Note> {
  const result = await request<{ note: Note }>(`/api/notes/${note.id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      title: note.title,
      content: note.content,
      isPinned: note.isPinned,
      expectedVersion: note.version,
    }),
  });
  return result.note;
}

export async function deleteNote(token: string, id: string): Promise<void> {
  await request<void>(`/api/notes/${id}`, token, { method: 'DELETE' });
}

export async function getNoteShare(token: string, noteId: string): Promise<NoteShare | null> {
  const result = await request<{ share: NoteShare | null }>(`/api/notes/${noteId}/share`, token);
  return result.share;
}

export async function createNoteShare(token: string, noteId: string): Promise<NoteShare> {
  const result = await request<{ share: NoteShare }>(`/api/notes/${noteId}/share`, token, {
    method: 'POST',
  });
  return result.share;
}

export async function revokeNoteShare(token: string, noteId: string): Promise<void> {
  await request<void>(`/api/notes/${noteId}/share`, token, { method: 'DELETE' });
}

export async function getSharedNote(shareId: string): Promise<SharedNote> {
  const result = await request<{ note: SharedNote }>(`/api/shares/${encodeURIComponent(shareId)}`, null);
  return result.note;
}
