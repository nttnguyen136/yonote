# Coding Standards — YONOTE

Standards enforced during `/code-review` (alongside `AGENTS.md`).

## Module Depth & `src/App.tsx` Locality

- **Do not grow `src/App.tsx` with new feature state or large JSX subtrees.** `src/App.tsx` orchestrates top-level workspace routing and layout. New domain logic belongs in focused modules under `src/lib/` (with unit tests at their public seam in `src/lib/*.test.ts`), and new UI subtrees or complex stateful interactions belong in dedicated components or hooks under `src/components/`.
- **Avoid duplicated state-reset clumps.** When multiple state variables transition together on `lock()`, `performUnlock()`, or `startOfflineMode()`, encapsulate the transition in a single helper or reducer rather than repeating setter calls across handlers.
- **Desktop workspace layout lives in two CSS files.** Base grid and responsive (`<= 1023px`) rules live in `src/styles.css`, while desktop (`>= 901px`) flex layout, sidebar collapse, resizer, and `.view-only-mode` panel visibility live in `src/resizable-layout.css`. Check both when changing workspace panel layout.

## API Client & Worker Alignment

- Before chaining multiple client calls in `src/lib/api.ts` (such as `createNote` followed by `updateNote`), check the corresponding handler in `worker/index.ts` to see if the Worker endpoint already supports the operation atomically in a single request.

## Privacy & Workspace Isolation

- **Cloud Mode** and **Private Offline Mode** must never share state across transitions (`lock()`, `startOfflineMode()`, `performUnlock()`).
- Async browser callbacks (`FileReader`, timers, `fetch`/promises) must guard against stale workspace transitions (`modeRef.current`) so callbacks that resolve after `Lock` or `Exit` never repopulate state.
- Never persist `ACCESS_KEY`, session tokens, note bodies, diagram sources, or temporary local previews to `localStorage`, `sessionStorage`, or `IndexedDB`.

## UI, Themes & Accessibility

- Use existing CSS variables/design tokens from `src/styles.css` across all six themes (`light`, `dark`, `midnight`, `sepia`, `forest`); never hard-code hex/rgb colors in component styles.
- Every icon-only button or control whose text label hides at narrow breakpoints must have both `aria-label` and `title`.
