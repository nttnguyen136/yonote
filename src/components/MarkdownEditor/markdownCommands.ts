import type { EditorView } from '@codemirror/view';

export interface MarkdownAction {
  label: string;
  title: string;
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
    label: 'H1',
    title: 'Heading 1',
    run: prefixSelectedLines('# ', 'Heading'),
  },
  {
    label: 'H2',
    title: 'Heading 2',
    run: prefixSelectedLines('## ', 'Heading'),
  },
  {
    label: 'B',
    title: 'Bold',
    run: wrapSelection('**', '**', 'bold text'),
  },
  {
    label: 'I',
    title: 'Italic',
    run: wrapSelection('*', '*', 'italic text'),
  },
  {
    label: '</>',
    title: 'Inline code',
    run: wrapSelection('`', '`', 'code'),
  },
  {
    label: 'Link',
    title: 'Insert link',
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
    run: prefixSelectedLines('- ', 'List item'),
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
