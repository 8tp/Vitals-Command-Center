import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer for AI briefings. Clean, warm body type (Plus Jakarta
 * Sans), soft inset code blocks, friendly sentence-case sub-headings.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-dispatch">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h3 className="font-display text-sm font-semibold mt-4 first:mt-0 mb-1.5 text-ink" {...props} />,
          h2: (props) => <h4 className="label-micro mt-4 first:mt-0 mb-1.5" {...props} />,
          h3: (props) => <h5 className="label-micro mt-3 mb-1" {...props} />,
          p: (props) => <p className="text-sm text-ink-dim leading-relaxed my-2" {...props} />,
          strong: (props) => <strong className="text-ink font-semibold" {...props} />,
          em: (props) => <em className="text-ink italic" {...props} />,
          a: (props) => <a className="text-signal underline underline-offset-2 hover:text-signal/80" {...props} />,
          ul: (props) => (
            <ul
              className="my-2 text-sm text-ink-dim space-y-1 pl-4 list-none [&>li]:relative [&>li]:pl-4 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.6em] [&>li]:before:w-1.5 [&>li]:before:h-px [&>li]:before:bg-signal/60"
              {...props}
            />
          ),
          ol: (props) => (
            <ol className="list-decimal pl-5 my-2 text-sm text-ink-dim space-y-1 marker:text-ink-mute" {...props} />
          ),
          li: (props) => <li className="leading-relaxed" {...props} />,
          code: ({ className, children, ...rest }) => {
            const inline = !/language-/.test(className ?? '');
            return inline ? (
              <code className="num text-xs bg-bg-inset text-ink px-1 py-0.5 rounded border border-hairline" {...rest}>
                {children}
              </code>
            ) : (
              <pre className="panel-inset p-3 text-xs num overflow-x-auto scrollbar-thin my-3 text-ink-dim">
                <code {...rest}>{children}</code>
              </pre>
            );
          },
          hr: () => <hr className="border-hairline my-4" />,
          blockquote: (props) => (
            <blockquote className="border-l-2 border-signal/40 pl-3 my-3 text-ink-dim italic" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
