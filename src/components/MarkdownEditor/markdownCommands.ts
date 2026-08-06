import type { EditorView } from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';

export interface MarkdownAction {
  label: string;
  title: string;
  shortcut?: string;
  run: (view: EditorView) => boolean;
}

function replaceSelection(
  view: EditorView,
  insert: string,
  selectionStart: number,
  selectionEnd: number,
): boolean {
  const { from, to } = view.state.selection.main;

  view.dispatch({
    changes: { from, to, insert },
    selection: {
      anchor: from + selectionStart,
      head: from + selectionEnd,
    },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

function wrapSelection(
  before: string,
  after: string,
  placeholder: string,
): (view: EditorView) => boolean {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const content = selected || placeholder;
    const insert = `${before}${content}${after}`;

    return replaceSelection(
      view,
      insert,
      before.length,
      before.length + content.length,
    );
  };
}

function prefixSelectedLines(
  prefix: string,
  placeholder: string,
): (view: EditorView) => boolean {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const firstLine = view.state.doc.lineAt(from);
    const lastLine = view.state.doc.lineAt(to);
    const selected = view.state.sliceDoc(firstLine.from, lastLine.to) || placeholder;
    const insert = selected
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');

    view.dispatch({
      changes: {
        from: firstLine.from,
        to: lastLine.to,
        insert,
      },
      selection: {
        anchor: firstLine.from,
        head: firstLine.from + insert.length,
      },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

function insertBlock(language: string, source: string): (view: EditorView) => boolean {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const content = selected || source;
    const insert = `\`\`\`${language}\n${content}\n\`\`\``;
    const contentOffset = language.length + 4;

    return replaceSelection(
      view,
      insert,
      contentOffset,
      contentOffset + content.length,
    );
  };
}

export const markdownActions: MarkdownAction[] = [
  {
    label: '↶',
    title: 'Undo',
    shortcut: 'Mod-z',
    run: undo,
  },
  {
    label: '↷',
    title: 'Redo',
    shortcut: 'Mod-Shift-z',
    run: redo,
  },
  {
    label: 'H1',
    title: 'Heading 1',
    shortcut: 'Mod-Alt-1',
    run: prefixSelectedLines('# ', 'Heading'),
  },
  {
    label: 'H2',
    title: 'Heading 2',
    shortcut: 'Mod-Alt-2',
    run: prefixSelectedLines('## ', 'Heading'),
  },
  {
    label: 'B',
    title: 'Bold',
    shortcut: 'Mod-b',
    run: wrapSelection('**', '**', 'bold text'),
  },
  {
    label: 'I',
    title: 'Italic',
    shortcut: 'Mod-i',
    run: wrapSelection('*', '*', 'italic text'),
  },
  {
    label: '</>',
    title: 'Inline code',
    shortcut: 'Mod-`',
    run: wrapSelection('`', '`', 'code'),
  },
  {
    label: 'Link',
    title: 'Insert link',
    shortcut: 'Mod-k',
    run: (view) => {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || 'link text';
      const insert = `[${selected}](https://)`;
      const urlStart = selected.length + 3;

      return replaceSelection(
        view,
        insert,
        urlStart,
        urlStart + 'https://'.length,
      );
    },
  },
  {
    label: 'Quote',
    title: 'Block quote',
    run: prefixSelectedLines('> ', 'Quote'),
  },
  {
    label: 'List',
    title: 'Bullet list',
    shortcut: 'Mod-Shift-8',
    run: prefixSelectedLines('- ', 'List item'),
  },
  {
    label: '1.',
    title: 'Numbered list',
    shortcut: 'Mod-Shift-7',
    run: prefixSelectedLines('1. ', 'List item'),
  },
  {
    label: 'Block',
    title: 'Code block',
    run: insertBlock('', 'code'),
  },
  {
    label: '—',
    title: 'Horizontal rule',
    run: (view) => replaceSelection(view, '\n---\n', 5, 5),
  },
  {
    label: 'Task',
    title: 'Task list',
    run: prefixSelectedLines('- [ ] ', 'Task'),
  },
  {
    label: 'Mermaid',
    title: 'Insert Mermaid block',
    run: insertBlock('mermaid', 'flowchart LR\n  A --> B'),
  },
  {
    label: 'PlantUML',
    title: 'Insert PlantUML block',
    run: insertBlock('plantuml', '@startuml\nA -> B\n@enduml'),
  },
];

export const markdownKeymap: KeyBinding[] = markdownActions
  .filter((action): action is MarkdownAction & { shortcut: string } => Boolean(action.shortcut))
  .map((action) => ({
    key: action.shortcut,
    run: action.run,
    preventDefault: true,
  }));
