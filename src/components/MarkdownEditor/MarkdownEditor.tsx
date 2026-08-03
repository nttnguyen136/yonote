import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, placeholder as placeholderExtension } from '@codemirror/view';
import { markdownActions } from './markdownCommands';
import { yonoteEditorTheme } from './markdownTheme';
import './markdown-editor.css';

const externalDocumentUpdate = Annotation.define<boolean>();

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: 'light' | 'dark';
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  theme,
  placeholder = 'Start writing Markdown…',
  autoFocus = false,
  readOnly = false,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown content',
          'aria-multiline': 'true',
          spellcheck: 'true',
        }),
        placeholderExtension(placeholder),
        yonoteEditorTheme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;

          const isExternal = update.transactions.some(
            (transaction) => transaction.annotation(externalDocumentUpdate) === true,
          );

          if (!isExternal) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: host,
    });

    viewRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is intentionally created once. Props are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
      selection: { anchor: 0 },
      scrollIntoView: true,
      annotations: externalDocumentUpdate.of(true),
    });
  }, [value]);

  useEffect(() => {
    hostRef.current?.setAttribute('data-editor-theme', theme);
  }, [theme]);

  return (
    <div className="markdown-editor-shell" data-editor-theme={theme}>
      <div className="markdown-editor-toolbar" role="toolbar" aria-label="Markdown formatting">
        {markdownActions.map((action) => (
          <button
            key={action.title}
            type="button"
            title={action.title}
            aria-label={action.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const view = viewRef.current;
              if (view && !readOnly) action.run(view);
            }}
            disabled={readOnly}
          >
            {action.label}
          </button>
        ))}
        <span className="markdown-editor-shortcuts">
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>F</kbd> search
        </span>
      </div>
      <div ref={hostRef} className="markdown-editor-host" />
    </div>
  );
}
