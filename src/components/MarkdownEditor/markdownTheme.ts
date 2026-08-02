import { EditorView } from '@codemirror/view';

export const yonoteEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '0',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: '14px',
    lineHeight: '1.7',
    overscrollBehavior: 'contain',
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '22px clamp(18px, 2.2vw, 32px) 70px',
    caretColor: 'var(--accent)',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--surface-hover) 62%, transparent)',
  },
  '.cm-gutters': {
    color: 'var(--muted-2)',
    backgroundColor: 'var(--bg)',
    borderRight: '1px solid var(--border-subtle)',
  },
  '.cm-activeLineGutter': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface-hover)',
  },
  '.cm-foldPlaceholder': {
    color: 'var(--muted)',
    backgroundColor: 'var(--surface-raised)',
    borderColor: 'var(--border)',
  },
  '.cm-panels': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--border)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--warning-soft)',
    outline: '1px solid var(--warning)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--accent-soft)',
    outlineColor: 'var(--accent)',
  },
  '.cm-tooltip': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface-overlay)',
    borderColor: 'var(--border)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    color: 'var(--text-strong)',
    backgroundColor: 'var(--surface-selected)',
  },
  '.cm-placeholder': {
    color: 'var(--muted-2)',
  },
});
