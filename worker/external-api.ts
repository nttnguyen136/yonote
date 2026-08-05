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

interface ExternalApiEnv {
  DB: D1Database;
  API_ALLOWED_ORIGINS?: string;
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

interface NoteMetadataRow {
  id: string;
  title: string;
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

interface NoteMetadata {
  id: string;
  title: string;
  isPinned: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

type ApiScope = 'notes:read' | 'notes:write';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
}

interface ApiKeyAuthRow {
  id: string;
  scopes: string;
}

interface ApiKeyAuth {
  scopes: Set<ApiScope>;
}

interface NotesCursor {
  updatedAt: number;
  id: string;
}

interface NoteValidationError {
  message: string;
  status: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_NOTE_BYTES = 1_000_000;
const API_KEY_BYTES = 32;
const API_DEFAULT_LIMIT = 50;
const API_MAX_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const API_SCOPES: readonly ApiScope[] = ['notes:read', 'notes:write'];

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

function externalError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  }, status);
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

function rowToNoteMetadata(row: NoteMetadataRow): NoteMetadata {
  return {
    id: row.id,
    title: row.title,
    isPinned: row.is_pinned === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function validateNote(
  titleValue: unknown,
  contentValue: unknown,
): { title: string; content: string } | NoteValidationError {
  if (typeof titleValue !== 'string' || typeof contentValue !== 'string') {
    return { message: 'Title and content must be strings.', status: 400 };
  }

  const title = titleValue.trim().slice(0, 200) || 'Untitled note';
  const contentBytes = encoder.encode(contentValue).byteLength;
  if (contentBytes > MAX_NOTE_BYTES) return { message: 'Note is too large.', status: 413 };

  return { title, content: contentValue };
}

function isNoteValidationError(
  value: { title: string; content: string } | NoteValidationError,
): value is NoteValidationError {
  return 'message' in value;
}

function parseStoredScopes(value: string): Set<ApiScope> {
  const scopes = value
    .split(',')
    .filter((scope): scope is ApiScope => API_SCOPES.includes(scope as ApiScope));
  return new Set(scopes);
}

function validateRequestedScopes(value: unknown): ApiScope[] | null {
  if (value === undefined) return [...API_SCOPES];
  if (!Array.isArray(value) || value.length === 0) return null;

  const scopes = [...new Set(value)];
  if (scopes.some((scope) => typeof scope !== 'string' || !API_SCOPES.includes(scope as ApiScope))) {
    return null;
  }
  return scopes as ApiScope[];
}

function apiKeyRowToPublic(row: ApiKeyRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: [...parseStoredScopes(row.scopes)],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function allowedOrigins(env: ExternalApiEnv): Set<string> {
  return new Set(
    (env.API_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== '*'),
  );
}

function isOriginAllowed(request: Request, env: ExternalApiEnv): boolean {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).has(origin);
}

function withExternalCors(response: Response, request: Request, env: ExternalApiEnv): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).has(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'Content-Type');
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function externalPreflight(request: Request, env: ExternalApiEnv): Response {
  if (!isOriginAllowed(request, env)) {
    return externalError('CORS_ORIGIN_DENIED', 'This origin is not allowed.', 403);
  }

  const origin = request.headers.get('Origin');
  const headers = apiHeaders({
    Allow: 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(null, { status: 204, headers });
}

async function authenticateApiKey(request: Request, env: ExternalApiEnv): Promise<ApiKeyAuth | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  const key = authorization.slice(7);
  if (!/^yn_[A-Za-z0-9_-]{43}$/.test(key)) return null;

  const now = Date.now();
  const keyHash = await sha256Base64Url(key);
  const row = await env.DB.prepare(`
    SELECT id, scopes
    FROM api_keys
    WHERE key_hash = ?
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).bind(keyHash, now).first<ApiKeyAuthRow>();
  if (!row) return null;

  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, row.id).run();
  return { scopes: parseStoredScopes(row.scopes) };
}

function hasScope(auth: ApiKeyAuth, scope: ApiScope): boolean {
  return auth.scopes.has(scope);
}

function encodeCursor(cursor: NotesCursor): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(cursor)));
}

function decodeCursor(value: string): NotesCursor | null {
  try {
    const parsed = JSON.parse(decoder.decode(base64UrlToBytes(value))) as Partial<NotesCursor>;
    if (!Number.isInteger(parsed.updatedAt) || (parsed.updatedAt ?? -1) < 0) return null;
    if (typeof parsed.id !== 'string' || !UUID_PATTERN.test(parsed.id)) return null;
    return { updatedAt: parsed.updatedAt as number, id: parsed.id };
  } catch {
    return null;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function listApiKeys(env: ExternalApiEnv): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at
    FROM api_keys
    ORDER BY created_at DESC
  `).all<ApiKeyRow>();
  return json({ apiKeys: (result.results ?? []).map(apiKeyRowToPublic) });
}

export async function createApiKey(request: Request, env: ExternalApiEnv): Promise<Response> {
  const body = await parseJson<{ name?: unknown; scopes?: unknown; expiresAt?: unknown }>(request);
  if (!body || typeof body.name !== 'string') return error('API key name is required.', 400);

  const name = body.name.trim();
  if (!name || name.length > 100) {
    return error('API key name must be between 1 and 100 characters.', 400);
  }

  const scopes = validateRequestedScopes(body.scopes);
  if (!scopes) return error('Scopes must contain notes:read and/or notes:write.', 400);

  let expiresAt: number | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    if (
      typeof body.expiresAt !== 'number'
      || !Number.isInteger(body.expiresAt)
      || body.expiresAt <= Date.now()
    ) {
      return error('expiresAt must be a future Unix timestamp in milliseconds.', 400);
    }
    expiresAt = body.expiresAt;
  }

  const createdAt = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = crypto.randomUUID();
    const key = `yn_${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(API_KEY_BYTES)))}`;
    const keyPrefix = key.slice(0, 11);
    const keyHash = await sha256Base64Url(key);
    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO api_keys (
        id, name, key_hash, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)
    `).bind(id, name, keyHash, keyPrefix, scopes.join(','), createdAt, expiresAt).run();

    if ((result.meta.changes ?? 0) > 0) {
      return json({
        apiKey: {
          id,
          name,
          key,
          keyPrefix,
          scopes,
          createdAt,
          lastUsedAt: null,
          expiresAt,
          revokedAt: null,
        },
      }, 201);
    }
  }

  return error('Unable to create API key.', 500);
}

export async function revokeApiKey(env: ExternalApiEnv, id: string): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return error('API key not found.', 404);

  const result = await env.DB.prepare(`
    UPDATE api_keys
    SET revoked_at = COALESCE(revoked_at, ?)
    WHERE id = ?
  `).bind(Date.now(), id).run();
  if ((result.meta.changes ?? 0) === 0) return error('API key not found.', 404);
  return new Response(null, { status: 204, headers: apiHeaders() });
}

async function listExternalNotes(url: URL, env: ExternalApiEnv): Promise<Response> {
  const limitValue = url.searchParams.get('limit');
  const limit = limitValue === null ? API_DEFAULT_LIMIT : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > API_MAX_LIMIT) {
    return externalError('INVALID_LIMIT', `limit must be an integer between 1 and ${API_MAX_LIMIT}.`, 400);
  }

  const pinnedValue = url.searchParams.get('pinned');
  let pinned: boolean | null = null;
  if (pinnedValue !== null) {
    if (pinnedValue !== 'true' && pinnedValue !== 'false') {
      return externalError('INVALID_PINNED_FILTER', 'pinned must be true or false.', 400);
    }
    pinned = pinnedValue === 'true';
  }

  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length > 200) {
    return externalError('INVALID_QUERY', 'q must not exceed 200 characters.', 400);
  }

  const updatedAfterValue = url.searchParams.get('updatedAfter');
  let updatedAfter: number | null = null;
  if (updatedAfterValue !== null) {
    updatedAfter = Number(updatedAfterValue);
    if (!Number.isInteger(updatedAfter) || updatedAfter < 0) {
      return externalError(
        'INVALID_UPDATED_AFTER',
        'updatedAfter must be a Unix timestamp in milliseconds.',
        400,
      );
    }
  }

  const cursorValue = url.searchParams.get('cursor');
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  if (cursorValue && !cursor) {
    return externalError('INVALID_CURSOR', 'cursor is invalid or expired.', 400);
  }

  const clauses: string[] = [];
  const values: unknown[] = [];
  if (pinned !== null) {
    clauses.push('is_pinned = ?');
    values.push(pinned ? 1 : 0);
  }
  if (query) {
    clauses.push("title LIKE ? ESCAPE '\\'");
    values.push(`%${escapeLike(query)}%`);
  }
  if (updatedAfter !== null) {
    clauses.push('updated_at > ?');
    values.push(updatedAfter);
  }
  if (cursor) {
    clauses.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
    values.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await env.DB.prepare(`
    SELECT id, title, is_pinned, version, created_at, updated_at
    FROM notes
    ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).bind(...values, limit + 1).all<NoteMetadataRow>();

  const rows = result.results ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return json({
    data: page.map(rowToNoteMetadata),
    pagination: {
      nextCursor: rows.length > limit && last
        ? encodeCursor({ updatedAt: last.updated_at, id: last.id })
        : null,
    },
  });
}

async function getExternalNote(env: ExternalApiEnv, id: string): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);

  const row = await env.DB.prepare(`
    SELECT id, title, content, is_pinned, version, created_at, updated_at
    FROM notes WHERE id = ?
  `).bind(id).first<NoteRow>();
  if (!row) return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);
  return json({ data: rowToNote(row) });
}

async function createExternalNote(request: Request, env: ExternalApiEnv): Promise<Response> {
  const body = await parseJson<{ title?: unknown; content?: unknown; isPinned?: unknown }>(request);
  if (!body) return externalError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  if (body.isPinned !== undefined && typeof body.isPinned !== 'boolean') {
    return externalError('INVALID_IS_PINNED', 'isPinned must be a boolean.', 400);
  }

  const validated = validateNote(body.title ?? 'Untitled note', body.content ?? '');
  if (isNoteValidationError(validated)) {
    return externalError(
      validated.status === 413 ? 'NOTE_TOO_LARGE' : 'INVALID_NOTE',
      validated.message,
      validated.status,
    );
  }

  const now = Date.now();
  const note: Note = {
    id: crypto.randomUUID(),
    title: validated.title,
    content: validated.content,
    isPinned: body.isPinned ?? false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await env.DB.prepare(`
    INSERT INTO notes (id, title, content, is_pinned, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(note.id, note.title, note.content, note.isPinned ? 1 : 0, now, now).run();
  return json({ data: note }, 201);
}

async function updateExternalNote(
  request: Request,
  env: ExternalApiEnv,
  id: string,
): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);

  const body = await parseJson<{
    title?: unknown;
    content?: unknown;
    isPinned?: unknown;
    expectedVersion?: unknown;
  }>(request);
  if (!body) return externalError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  if (
    typeof body.expectedVersion !== 'number'
    || !Number.isInteger(body.expectedVersion)
    || body.expectedVersion < 1
  ) {
    return externalError(
      'EXPECTED_VERSION_REQUIRED',
      'expectedVersion must be a positive integer.',
      400,
    );
  }
  if (body.title === undefined && body.content === undefined && body.isPinned === undefined) {
    return externalError('EMPTY_UPDATE', 'Provide title, content, or isPinned.', 400);
  }
  if (body.isPinned !== undefined && typeof body.isPinned !== 'boolean') {
    return externalError('INVALID_IS_PINNED', 'isPinned must be a boolean.', 400);
  }

  const current = await env.DB.prepare(`
    SELECT id, title, content, is_pinned, version, created_at, updated_at
    FROM notes WHERE id = ?
  `).bind(id).first<NoteRow>();
  if (!current) return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);

  const validated = validateNote(body.title ?? current.title, body.content ?? current.content);
  if (isNoteValidationError(validated)) {
    return externalError(
      validated.status === 413 ? 'NOTE_TOO_LARGE' : 'INVALID_NOTE',
      validated.message,
      validated.status,
    );
  }

  const now = Date.now();
  const isPinned = body.isPinned ?? (current.is_pinned === 1);
  const result = await env.DB.prepare(`
    UPDATE notes
    SET title = ?, content = ?, is_pinned = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND version = ?
  `).bind(validated.title, validated.content, isPinned ? 1 : 0, now, id, body.expectedVersion).run();

  if ((result.meta.changes ?? 0) === 0) {
    const latest = await env.DB.prepare('SELECT version FROM notes WHERE id = ?')
      .bind(id)
      .first<{ version: number }>();
    if (!latest) return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);
    return externalError('VERSION_CONFLICT', 'The note has been modified.', 409, {
      currentVersion: latest.version,
    });
  }

  const updated = await env.DB.prepare(`
    SELECT id, title, content, is_pinned, version, created_at, updated_at
    FROM notes WHERE id = ?
  `).bind(id).first<NoteRow>();
  return json({ data: rowToNote(updated!) });
}

async function deleteExternalNote(env: ExternalApiEnv, id: string): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);

  await env.DB.prepare('DELETE FROM note_shares WHERE note_id = ?').bind(id).run();
  const result = await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  if ((result.meta.changes ?? 0) === 0) {
    return externalError('NOTE_NOT_FOUND', 'Note not found.', 404);
  }
  return new Response(null, { status: 204, headers: apiHeaders() });
}

async function handleExternalApiRequest(
  request: Request,
  env: ExternalApiEnv,
  ensureSchema: () => Promise<void>,
): Promise<Response> {
  if (request.method === 'OPTIONS') return externalPreflight(request, env);
  if (!isOriginAllowed(request, env)) {
    return externalError('CORS_ORIGIN_DENIED', 'This origin is not allowed.', 403);
  }

  const url = new URL(request.url);
  await ensureSchema();

  if (url.pathname === '/api/v1/health') {
    const response = request.method === 'GET'
      ? json({ data: { status: 'ok', version: 'v1' } })
      : externalError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    return withExternalCors(response, request, env);
  }

  const auth = await authenticateApiKey(request, env);
  if (!auth) {
    return withExternalCors(
      externalError('UNAUTHORIZED', 'A valid API key is required.', 401),
      request,
      env,
    );
  }

  let response: Response;
  if (url.pathname === '/api/v1/notes') {
    if (request.method === 'GET') {
      response = hasScope(auth, 'notes:read')
        ? await listExternalNotes(url, env)
        : externalError('INSUFFICIENT_SCOPE', 'notes:read scope is required.', 403);
    } else if (request.method === 'POST') {
      response = hasScope(auth, 'notes:write')
        ? await createExternalNote(request, env)
        : externalError('INSUFFICIENT_SCOPE', 'notes:write scope is required.', 403);
    } else {
      response = externalError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    }
    return withExternalCors(response, request, env);
  }

  const noteMatch = url.pathname.match(/^\/api\/v1\/notes\/([^/]+)$/);
  if (noteMatch) {
    const id = noteMatch[1];
    if (request.method === 'GET') {
      response = hasScope(auth, 'notes:read')
        ? await getExternalNote(env, id)
        : externalError('INSUFFICIENT_SCOPE', 'notes:read scope is required.', 403);
    } else if (request.method === 'PATCH') {
      response = hasScope(auth, 'notes:write')
        ? await updateExternalNote(request, env, id)
        : externalError('INSUFFICIENT_SCOPE', 'notes:write scope is required.', 403);
    } else if (request.method === 'DELETE') {
      response = hasScope(auth, 'notes:write')
        ? await deleteExternalNote(env, id)
        : externalError('INSUFFICIENT_SCOPE', 'notes:write scope is required.', 403);
    } else {
      response = externalError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    }
    return withExternalCors(response, request, env);
  }

  return withExternalCors(externalError('NOT_FOUND', 'Not found.', 404), request, env);
}


export async function handleExternalApi(
  request: Request,
  env: ExternalApiEnv,
  ensureSchema: () => Promise<void>,
): Promise<Response> {
  try {
    return await handleExternalApiRequest(request, env, ensureSchema);
  } catch (cause) {
    console.error(cause);
    return withExternalCors(
      externalError('INTERNAL_ERROR', 'Internal server error.', 500),
      request,
      env,
    );
  }
}
