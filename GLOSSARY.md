# Glossary — YONOTE

Canonical domain terms used across code, tests, issues, and documentation.

- **Cloud Mode (`mode === 'online'`)**: Authenticated workspace unlocked with `ACCESS_KEY`. Notes are persisted in Cloudflare D1 via `/api/notes`. Session tokens live exclusively in page memory; reloading the page returns to `UnlockScreen`.
- **Private Offline Mode (`mode === 'offline'`)**: Unauthenticated local workspace. Makes zero requests to `/api/*` or D1. Workspace state (`notes`, `selectedId`, `isViewOnly`, `appView`, `liveUmlSource`, `liveMermaidSource`, and `isActive`) is persisted in browser `localStorage` (`yonote-offline-workspace-v1`, managed by `src/lib/offlineStorage.ts`). Refreshing (`F5`) while `isActive` is `true` reopens Private Offline Mode directly; clicking `Exit` sets `isActive: false` and returns to `UnlockScreen` while preserving saved offline data.
- **Offline Note**: A `Note` item stored in Private Offline Mode (`version: 0`). Importing a `.md` / `.markdown` / `.txt` file in Private Offline Mode immediately creates and selects a new Offline Note in **View-only Mode**.
- **Local Preview (`LocalMarkdownPreview`)**: In **Cloud Mode** only, importing a `.md` / `.markdown` / `.txt` file opens an ephemeral RAM-only preview (`src/lib/markdownImport.ts`) before the user chooses whether to save it as a new D1 note or overwrite the selected note.
- **View-only Mode (`isViewOnly`)**: Reading layout that hides the Markdown editor pane so the preview occupies the full workspace and locks title/content editing until the user switches back to `Edit`.
- **Live Diagram (`LiveUmlWorkspace`)**: Split-pane PlantUML and Mermaid editor/preview available exclusively in Private Offline Mode (`appView === 'uml'`). All diagram rendering happens client-side in the browser.
- **Public Share**: A read-only capability URL (`/s/:shareId`, backed by `/api/shares/:shareId` with `Cache-Control: no-store`) for a single Cloud Mode note.
- **External API Key**: A scoped (`notes:read`, `notes:write`), revocable `yn_...` Bearer token hashed with SHA-256 in D1 for `/api/v1/*` programmatic access.
