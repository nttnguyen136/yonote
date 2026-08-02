import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';
import { PlantUmlBlock } from './PlantUmlBlock';

export function MarkdownPreview({
  content,
  token,
  offlineMode,
  theme,
}: {
  content: string;
  token: string | null;
  offlineMode: boolean;
  theme: 'light' | 'dark';
}) {
  return (
    <article className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={{
          code({ node: _node, className, children, ...props }) {
            const match = /language-([\w-]+)/.exec(className ?? '');
            const language = match?.[1]?.toLowerCase();
            const source = String(children).replace(/\n$/, '');

            if (language === 'mermaid') return <MermaidBlock source={source} theme={theme} />;
            if (language === 'plantuml' || language === 'puml') {
              if (offlineMode || !token) {
                return (
                  <div className="diagram-unavailable">
                    <strong>PlantUML is disabled in private offline mode.</strong>
                    <span>No source is posted to a remote renderer.</span>
                    <pre><code>{source}</code></pre>
                  </div>
                );
              }
              return <PlantUmlBlock source={source} token={token} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ node: _node, ...props }) {
            return <a {...props} target="_blank" rel="noreferrer noopener" />;
          },
        }}
      >
        {content || '*Empty note*'}
      </ReactMarkdown>
    </article>
  );
}
