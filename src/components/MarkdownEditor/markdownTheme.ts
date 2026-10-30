import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const yonoteHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.meta, tags.documentMeta, tags.annotation, tags.processingInstruction],
    color: 'var(--muted)',
  },
  {
    tag: tags.link,
    color: 'var(--accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  {
    tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
    color: 'var(--text-strong)',
    fontWeight: '750',
  },
  {
    tag: [tags.heading4, tags.heading5, tags.heading6],
    color: 'var(--text)',
    fontWeight: '700',
  },
  {
    tag: tags.emphasis,
    color: 'var(--text)',
    fontStyle: 'italic',
  },
  {
    tag: tags.strong,
    color: 'var(--text-strong)',
    fontWeight: '700',
  },
  {
    tag: tags.strikethrough,
    color: 'var(--muted)',
    textDecoration: 'line-through',
  },
  {
    tag: tags.quote,
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  {
    tag: [tags.monospace, tags.special(tags.string)],
    color: 'color-mix(in srgb, var(--text-strong) 84%, var(--accent) 16%)',
  },
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword],
    color: 'var(--accent)',
    fontWeight: '650',
  },
  {
    tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName],
    color: 'var(--accent)',
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.literal, tags.inserted],
    color: 'var(--success)',
  },
  {
    tag: [tags.string, tags.character, tags.attributeValue],
    color: 'color-mix(in srgb, var(--success) 82%, var(--text-strong) 18%)',
  },
  {
    tag: [tags.regexp, tags.escape],
    color: 'var(--warning)',
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.tagName],
    color: 'var(--offline)',
  },
  {
    tag: [tags.variableName, tags.propertyName, tags.attributeName, tags.macroName],
    color: 'var(--text-strong)',
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket],
    color: 'var(--muted)',
  },
  {
    tag: tags.comment,
    color: 'var(--muted-2)',
    fontStyle: 'italic',
  },
  {
    tag: [tags.invalid, tags.deleted],
    color: 'var(--danger)',
  },
]);

const yonoteEditorBaseTheme = EditorView.theme({
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
    borderLeftWidth: '2px',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--selection-bg) !important',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--selection-inactive-bg) !important',
  },
  '.cm-content ::selection, .cm-line ::selection, .cm-line > span::selection': {
    backgroundColor: 'var(--selection-bg)',
    color: 'var(--selection-text)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--selection-match-bg)',
    outline: '1px solid var(--accent-border)',
    borderRadius: '2px',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--surface-hover) 58%, transparent)',
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
  '&.cm-focused .cm-matchingBracket': {
    color: 'var(--text-strong)',
    backgroundColor: 'var(--accent-soft)',
    outline: '1px solid var(--accent-border)',
    borderRadius: '2px',
  },
  '&.cm-focused .cm-nonmatchingBracket': {
    color: 'var(--danger-text)',
    backgroundColor: 'var(--danger-soft)',
    outline: '1px solid var(--danger-border)',
    borderRadius: '2px',
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
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--selection-bg)',
    outline: '1px solid var(--accent)',
    borderRadius: '2px',
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

export const yonoteEditorTheme: Extension = [
  yonoteEditorBaseTheme,
  syntaxHighlighting(yonoteHighlightStyle),
];
