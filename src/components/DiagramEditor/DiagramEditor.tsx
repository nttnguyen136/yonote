import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';
import type { DiagramLanguage } from '../LiveUmlWorkspace';
import { yonoteEditorTheme } from '../MarkdownEditor/markdownTheme';
import { diagramLanguage } from './diagramLanguage';
import './diagram-editor.css';

const externalUpdate = Annotation.define<boolean>();

interface DiagramEditorProps {
  language: DiagramLanguage;
  value: string;
  onChange: (value: string) => void;
  theme: 'light' | 'dark';
}

export function DiagramEditor({ language, value, onChange, theme }: DiagramEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const languageCompartment = useRef(new Compartment()).current;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          languageCompartment.of(diagramLanguage(language)),
          EditorView.lineWrapping,
          yonoteEditorTheme,
          placeholderExtension(`Enter ${language === 'plantuml' ? 'PlantUML' : 'Mermaid'} source…`),
          keymap.of([
            { key: 'Tab', run: indentMore },
            { key: 'Shift-Tab', run: indentLess },
          ]),
          EditorView.contentAttributes.of({
            'aria-label': `${language === 'plantuml' ? 'PlantUML' : 'Mermaid'} source`,
            'aria-multiline': 'true',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocorrect: 'off',
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const isExternal = update.transactions.some(
              (transaction) => transaction.annotation(externalUpdate) === true,
            );
            if (!isExternal) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor instance is stable; prop changes are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: languageCompartment.reconfigure(diagramLanguage(language)) });
  }, [language, languageCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalUpdate.of(true),
    });
  }, [value]);

  return <div ref={hostRef} className="diagram-editor" data-editor-theme={theme} />;
}
