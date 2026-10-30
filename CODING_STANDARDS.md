# Coding Standards — YONOTE

Standards enforced during implementation and `/code-review`. See `GLOSSARY.md` for canonical domain terminology.

## Module Depth & `src/App.tsx` Locality

- **Do not grow `src/App.tsx` with new feature state or large JSX subtrees.** `src/App.tsx` orchestrates top-level workspace routing and layout. New domain logic belongs in focused modules under `src/lib/` (with unit tests at their public seam in `src/lib/*.test.ts`), and new UI subtrees or complex stateful interactions belong in dedicated components or hooks under `src/components/`.
- **Avoid duplicated state-reset clumps.** When multiple state variables transition together on `lock()`, `performUnlock()`, or `startOfflineMode()`, encapsulate the transition in a single helper or reducer rather than repeating setter calls across handlers.
- **Desktop workspace layout lives in two CSS files.** Base grid and responsive (`<= 1023px`) rules live in `src/styles.css`, while desktop (`>= 901px`) flex layout, sidebar collapse, resizer, and `.view-only-mode` panel visibility live in `src/resizable-layout.css`. Check both when changing workspace panel layout.

## Privacy & Workspace Isolation

- **Cloud Mode** and **Private Offline Mode** must never share state across transitions (`lock()`, `startOfflineMode()`, `performUnlock()`).
- **Cloud Mode**:
  - All note requests must go through `src/lib/api.ts`.
  - Never persist `ACCESS_KEY`, session tokens, Cloud notes, or Cloud Mode `LocalPreview` to `localStorage`, `sessionStorage`, `IndexedDB`, or client cookies.
  - Page refresh must require re-entering `ACCESS_KEY`.
  - Preserve optimistic concurrency (`version` / conflict detection) when updating notes, and flush pending saves before creating a public share.
- **Private Offline Mode**:
  - Never call `/api/unlock`, `/api/notes`, `/api/shares`, or any D1/sync endpoint.
  - Persist offline workspace state (`notes`, `selectedId`, `isViewOnly`, `appView`, `liveUmlSource`, `liveMermaidSource`, `isActive`) exclusively via `src/lib/offlineStorage.ts` in browser `localStorage`.
  - Importing a Markdown file in Offline Mode must immediately create a persisted Offline Note opened in `View-only` mode (bypassing `LocalPreview`).
- Async browser callbacks (`FileReader`, timers, `fetch`/promises) must guard against stale workspace transitions (`modeRef.current`) so callbacks that resolve after `Lock` or `Exit` never repopulate state.

## Diagram Rendering & Viewport

- Mermaid and PlantUML must render 100% in the browser; never send diagram source to the Worker, Kroki, PlantUML Server, or external services.
- Keep Mermaid `securityLevel: 'strict'`. Block external file/URL includes in PlantUML (only bundled standard-library includes are allowed).
- `src/components/DiagramViewport.tsx` owns zoom (25%–400%), mouse/touch/touchpad pan, pinch/`Ctrl+wheel` zoom, keyboard navigation, reset, and ARIA focus. Do not inline zoom/pan math into `LiveUmlWorkspace.tsx`.

## React, TypeScript & Dependencies

- Keep TypeScript `strict` with no `any`. Use `import type` for type-only imports.
- In `src/lib/*.ts` modules covered by `node --test`, use explicit `.ts` extensions on relative imports (`allowImportingTsExtensions` is enabled in `tsconfig.app.json`) so both `node --test` and `tsc -b` resolve modules identically.
- Compute derived state during render instead of duplicating state; use `useMemo`/`useCallback` only when they provide a concrete benefit.
- Clean up timers, event listeners, object URLs, and async side effects.
- Lazy-load heavy workspaces and editors; never make Mermaid or PlantUML an eager dependency of the application shell.
- Do not add npm dependencies when Web APIs or existing libraries suffice.

## UI, Themes & Accessibility

- Maintain responsive layout across desktop, tablet, and mobile without breaking the mobile `Notes` / `Edit` / `Preview` tabs or overflowing toolbars.
- Every icon-only button or control whose text label hides at narrow breakpoints must have both `aria-label` and `title`.
- Support keyboard navigation, mouse + touch pointer events, and `prefers-reduced-motion`.
- Use existing CSS variables/design tokens from `src/styles.css` across all six themes (`light`, `dark`, `midnight`, `sepia`, `forest`); never hard-code hex/rgb colors in component styles.

## Worker, API & PWA

- Before chaining multiple client calls in `src/lib/api.ts`, check `worker/index.ts` and `openapi.yaml` / `docs/external-api.md` to see if the Worker endpoint already supports the operation atomically.
- Validate HTTP method, payload shape, and byte limits in `worker/index.ts`; never leak secrets or sensitive error details.
- Public shares must return `Cache-Control: no-store` and preserve 192-bit share ID entropy.
- Database schema changes require a new numbered SQL file in `migrations/`; never mutate an already-applied migration.
- Service worker may cache the application shell only—never cache, replay, or background-sync API requests/responses. Bump the cache version when changing cached assets.
