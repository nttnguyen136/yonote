import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';
import { PlantUmlBlock } from './PlantUmlBlock';

export function MarkdownPreview({
  content,
  theme,
}: {
  content: string;
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
              return <PlantUmlBlock source={source} theme={theme} />;
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
