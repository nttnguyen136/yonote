import { StreamLanguage } from '@codemirror/language';
import type { StreamParser, StringStream } from '@codemirror/language';
import type { DiagramLanguage } from '../LiveUmlWorkspace';

interface DiagramParserState {
  inBlockComment: boolean;
}

const PLANTUML_KEYWORDS = /^(?:@(?:startuml|enduml|startmindmap|endmindmap|startwbs|endwbs)|actor|boundary|class|cloud|component|database|entity|enum|interface|node|package|participant|queue|rectangle|start|stop|if|then|else|elseif|endif|repeat|while|endwhile|fork|end fork|title|skinparam|note|legend|left|right|top|bottom|hide|show|newpage)\b/i;
const MERMAID_KEYWORDS = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|sankey-beta|xychart-beta|participant|actor|class|state|subgraph|end|title|section|loop|alt|else|opt|par|and|rect|critical|break)\b/;

function tokenString(stream: StringStream): string | null {
  if (!stream.match(/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)) return null;
  return 'string';
}

const diagramParser: StreamParser<DiagramParserState> = {
  startState: () => ({ inBlockComment: false }),
  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    if (stream.eatSpace()) return null;
    if (stream.match("/'")) {
      state.inBlockComment = true;
      return 'comment';
    }
    if (stream.match(/^\s*(?:'|%%|\/\/).*/)) return 'comment';

    const stringToken = tokenString(stream);
    if (stringToken) return stringToken;
    if (stream.match(PLANTUML_KEYWORDS) || stream.match(MERMAID_KEYWORDS)) return 'keyword';
    if (stream.match(/^(?:true|false|null|yes|no)\b/i)) return 'bool';
    if (stream.match(/^#[0-9a-f]{3,8}\b/i) || stream.match(/^\b\d+(?:\.\d+)?\b/)) return 'number';
    if (stream.match(/^(?:--?>|<--?|\.\.?>|<\.\.?|==?>|<==?|--|\.\.|::|\|>|<\|)/)) return 'operator';
    if (stream.match(/^[{}()[\]]/)) return 'bracket';
    if (stream.match(/^@[a-z][\w-]*/i)) return 'meta';
    if (stream.match(/^[A-Z][\w.]*/)) return 'typeName';
    stream.next();
    return null;
  },
};

const languageSupport = StreamLanguage.define(diagramParser);

export function diagramLanguage(_language: DiagramLanguage) {
  return languageSupport;
}
