# YONOTE External API v1

External API cho phép ứng dụng, script hoặc automation đọc và thay đổi Cloud Notes mà không dùng session token ngắn hạn của giao diện web.

## 1. Authentication model

Public CRUD endpoint dùng API key dạng:

```text
yn_<43 base64url characters>
```

Gửi key qua header:

```http
Authorization: Bearer yn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API key:

- Có scope `notes:read`, `notes:write` hoặc cả hai.
- Có thể đặt thời điểm hết hạn.
- Có thể revoke độc lập.
- Chỉ được trả plaintext một lần khi tạo.
- Chỉ SHA-256 hash được lưu trong D1.

Session token từ `/api/unlock` không được chấp nhận tại `/api/v1/*`.

## 2. Apply migration

```bash
npx wrangler d1 migrations apply yonote-db --local
npx wrangler d1 migrations apply yonote-db --remote
```

Migration `0003_api_keys.sql` tạo bảng `api_keys`.

## 3. Create an API key

API key được quản lý bằng session Cloud Mode hiện có.

### 3.1 Get a session token

```bash
curl -sS https://notes.example.com/api/unlock \
  -H 'Content-Type: application/json' \
  -d '{"key":"YOUR_ACCESS_KEY"}'
```

Response:

```json
{
  "token": "SESSION_TOKEN",
  "expiresIn": 43200
}
```

### 3.2 Create a scoped key

```bash
curl -sS https://notes.example.com/api/api-keys \
  -H 'Authorization: Bearer SESSION_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "automation-client",
    "scopes": ["notes:read", "notes:write"]
  }'
```

Optional `expiresAt` is a future Unix timestamp in milliseconds.

Response:

```json
{
  "apiKey": {
    "id": "3d46e5b5-2895-41a9-a16f-a09f39ab71f1",
    "name": "automation-client",
    "key": "yn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "keyPrefix": "yn_xxxxxxxx",
    "scopes": ["notes:read", "notes:write"],
    "createdAt": 1785895200000,
    "lastUsedAt": null,
    "expiresAt": null,
    "revokedAt": null
  }
}
```

Store `key` immediately. It cannot be retrieved again.

### 3.3 List key metadata

```bash
curl -sS https://notes.example.com/api/api-keys \
  -H 'Authorization: Bearer SESSION_TOKEN'
```

### 3.4 Revoke a key

```bash
curl -i -X DELETE \
  https://notes.example.com/api/api-keys/3d46e5b5-2895-41a9-a16f-a09f39ab71f1 \
  -H 'Authorization: Bearer SESSION_TOKEN'
```

## 4. CRUD notes

Set variables for examples:

```bash
BASE_URL=https://notes.example.com
YONOTE_API_KEY=yn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Create

```bash
curl -sS "$BASE_URL/api/v1/notes" \
  -H "Authorization: Bearer $YONOTE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "API note",
    "content": "# Created through API",
    "isPinned": false
  }'
```

### List

```bash
curl -sS \
  "$BASE_URL/api/v1/notes?limit=50&pinned=false&q=API&updatedAfter=1785800000000" \
  -H "Authorization: Bearer $YONOTE_API_KEY"
```

Supported query parameters:

| Parameter | Description |
|---|---|
| `limit` | Integer from 1 to 100; default 50 |
| `cursor` | Opaque cursor returned by the previous page |
| `pinned` | `true` or `false` |
| `q` | Case-insensitive SQLite title search, maximum 200 characters |
| `updatedAfter` | Only notes updated after this Unix timestamp in milliseconds |

List responses intentionally omit `content`. Use the item endpoint to load the full note.

```json
{
  "data": [
    {
      "id": "bc24a947-bbd5-4f50-a2bf-6884ef6f65db",
      "title": "API note",
      "isPinned": false,
      "version": 1,
      "createdAt": 1785895200000,
      "updatedAt": 1785895200000
    }
  ],
  "pagination": {
    "nextCursor": null
  }
}
```

### Get one note

```bash
curl -sS "$BASE_URL/api/v1/notes/NOTE_ID" \
  -H "Authorization: Bearer $YONOTE_API_KEY"
```

### Update

Every update must include the version last read by the client:

```bash
curl -sS -X PATCH "$BASE_URL/api/v1/notes/NOTE_ID" \
  -H "Authorization: Bearer $YONOTE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Updated title",
    "expectedVersion": 1
  }'
```

When another client has already updated the note, the API returns `409 VERSION_CONFLICT` and the latest version:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "The note has been modified.",
    "details": {
      "currentVersion": 2
    }
  }
}
```

### Delete

```bash
curl -i -X DELETE "$BASE_URL/api/v1/notes/NOTE_ID" \
  -H "Authorization: Bearer $YONOTE_API_KEY"
```

Deleting a note also removes its public share record.

## 5. CORS

Server-to-server clients do not send `Origin` and require no CORS configuration.

For browser clients, configure an exact comma-separated allowlist:

```dotenv
API_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

Wildcard `*` is intentionally ignored. When the variable is empty or absent, browser-origin requests to `/api/v1/*` are rejected while server-to-server requests continue to work.

## 6. Error format

External API errors use a stable envelope:

```json
{
  "error": {
    "code": "NOTE_NOT_FOUND",
    "message": "Note not found."
  }
}
```

Common status codes:

| Status | Meaning |
|---|---|
| `400` | Invalid JSON, filter, cursor or payload |
| `401` | Missing, invalid, expired or revoked API key |
| `403` | Missing scope or disallowed browser origin |
| `404` | Resource not found |
| `409` | Version conflict |
| `413` | Note content exceeds 1 MB UTF-8 |

## 7. Operational notes

- API responses use `Cache-Control: no-store`.
- Each authenticated request updates `last_used_at` for the API key.
- API keys do not grant access to public-share management or API-key administration.
- Rate limiting is not implemented in this patch. Configure Cloudflare WAF/Rate Limiting before exposing the API to untrusted high-volume clients.
- The machine-readable contract is available in `openapi.yaml`.
