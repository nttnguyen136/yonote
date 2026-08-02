interface D1Result<T = unknown> {
  success: boolean;
  meta: { changes?: number };
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  DB: D1Database;
  ASSETS: AssetsBinding;
  ACCESS_KEY: string;
  TOKEN_SECRET: string;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  is_pinned: number;
  version: number;
  created_at: number;
  updated_at: number;
}

interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

const encoder = new TextEncoder();
const MAX_NOTE_BYTES = 1_000_000;
const TOKEN_TTL_SECONDS = 12 * 60 * 60;
let schemaReady: Promise<void> | undefined;

function apiHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return headers;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: apiHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: row.is_pinned === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
          version INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated ON notes(is_pinned DESC, updated_at DESC)').run();
    })().catch((cause) => {
      schemaReady = undefined;
      throw cause;
    });
  }
  return schemaReady;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function createToken(secret: string): Promise<string> {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

async function verifyToken(token: string, secret: string): Promise<boolean> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return false;

  try {
    const expected = await hmac(payloadPart, secret);
    const received = base64UrlToBytes(signaturePart);
    if (!constantTimeEqual(expected, received)) return false;

    const payloadText = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    const payload = JSON.parse(payloadText) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  return verifyToken(authorization.slice(7), env.TOKEN_SECRET);
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function validateNote(titleValue: unknown, contentValue: unknown): { title: string; content: string } | Response {
  if (typeof titleValue !== 'string' || typeof contentValue !== 'string') {
    return error('Title and content must be strings.', 400);
  }

  const title = titleValue.trim().slice(0, 200) || 'Untitled note';
  const contentBytes = encoder.encode(contentValue).byteLength;
  if (contentBytes > MAX_NOTE_BYTES) return error('Note is too large.', 413);

  return { title, content: contentValue };
}

async function handleUnlock(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ key?: unknown }>(request);
  if (!body || typeof body.key !== 'string' || body.key.length > 512) {
    return error('Invalid key.', 400);
  }

  const [providedHash, expectedHash] = await Promise.all([sha256(body.key), sha256(env.ACCESS_KEY)]);
  if (!constantTimeEqual(providedHash, expectedHash)) {
    return error('Access denied.', 401);
  }

  return json({ token: await createToken(env.TOKEN_SECRET), expiresIn: TOKEN_TTL_SECONDS });
}

async function listNotes(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT id, title, content, is_pinned, version, created_at, updated_at
    FROM notes
    ORDER BY is_pinned DESC, updated_at DESC
    LIMIT 500
  `).all<NoteRow>();
  return json({ notes: (result.results ?? []).map(rowToNote) });
}

async function createNote(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ title?: unknown; content?: unknown }>(request);
  const validated = validateNote(body?.title ?? 'Untitled note', body?.content ?? '');
  if (validated instanceof Response) return validated;

  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO notes (id, title, content, is_pinned, version, created_at, updated_at)
    VALUES (?, ?, ?, 0, 1, ?, ?)
  `).bind(id, validated.title, validated.content, now, now).run();

  return json({
    note: {
      id,
      title: validated.title,
      content: validated.content,
      isPinned: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    } satisfies Note,
  }, 201);
}

async function updateNote(request: Request, env: Env, id: string): Promise<Response> {
  const body = await parseJson<{
    title?: unknown;
    content?: unknown;
    isPinned?: unknown;
    expectedVersion?: unknown;
  }>(request);
  if (!body || typeof body.expectedVersion !== 'number' || !Number.isInteger(body.expectedVersion)) {
    return error('expectedVersion is required.', 400);
  }

  const current = await env.DB.prepare(`
    SELECT id, title, content, is_pinned, version, created_at, updated_at
    FROM notes WHERE id = ?
  `).bind(id).first<NoteRow>();
  if (!current) return error('Note not found.', 404);

  const validated = validateNote(body.title ?? current.title, body.content ?? current.content);
  if (validated instanceof Response) return validated;
  const isPinned = typeof body.isPinned === 'boolean' ? body.isPinned : current.is_pinned === 1;
  const now = Date.now();

  const result = await env.DB.prepare(`
    UPDATE notes
    SET title = ?, content = ?, is_pinned = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND version = ?
  `).bind(
    validated.title,
    validated.content,
    isPinned ? 1 : 0,
    now,
    id,
    body.expectedVersion,
  ).run();

  if ((result.meta.changes ?? 0) === 0) {
    return error('This note was changed in another tab. Reload before saving again.', 409);
  }

  const updated = await env.DB.prepare(`
    SELECT id, title, content, is_pinned, version, created_at, updated_at
    FROM notes WHERE id = ?
  `).bind(id).first<NoteRow>();

  return json({ note: rowToNote(updated!) });
}

async function deleteNote(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  if ((result.meta.changes ?? 0) === 0) return error('Note not found.', 404);
  return new Response(null, { status: 204, headers: apiHeaders() });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: apiHeaders({ Allow: 'GET, POST, PATCH, DELETE, OPTIONS' }) });
  }

  if (url.pathname === '/api/unlock' && request.method === 'POST') {
    return handleUnlock(request, env);
  }

  if (!(await isAuthorized(request, env))) return error('Unauthorized.', 401);
  await ensureSchema(env.DB);

  if (url.pathname === '/api/notes') {
    if (request.method === 'GET') return listNotes(env);
    if (request.method === 'POST') return createNote(request, env);
    return error('Method not allowed.', 405);
  }

  const noteMatch = url.pathname.match(/^\/api\/notes\/([0-9a-f-]+)$/i);
  if (noteMatch) {
    const id = noteMatch[1];
    if (request.method === 'PATCH') return updateNote(request, env, id);
    if (request.method === 'DELETE') return deleteNote(env, id);
    return error('Method not allowed.', 405);
  }


  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ status: 'ok' });
  }

  return error('Not found.', 404);
}

function secureAssetResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
      return secureAssetResponse(await env.ASSETS.fetch(request));
    } catch (cause) {
      console.error(cause);
      return error('Internal server error.', 500);
    }
  },
};
