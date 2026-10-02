import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic text-volt/90">{children}</em>,
  del: ({ children }) => <del className="text-dim">{children}</del>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 ps-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 ps-4">{children}</ol>,
  li: ({ children }) => <li className="ps-1 marker:text-volt/60">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 font-display text-[14px] font-bold uppercase tracking-wide text-volt first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 font-display text-[14px] font-bold uppercase tracking-wide text-volt first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2.5 font-display text-[13px] font-bold uppercase tracking-wide text-ink first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-1 mt-2 font-display text-[13px] font-semibold text-ink first:mt-0">{children}</h4>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-volt underline decoration-volt/40 underline-offset-2 hover:decoration-volt">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="num rounded border border-line bg-bg px-1.5 py-0.5 text-[12px] text-aqua">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-line bg-bg p-3 text-[12px]">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-volt/40 bg-volt/5 py-1.5 ps-3 pe-2 text-mute">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface2">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-line px-3 py-1.5 text-left font-display text-[10px] font-semibold uppercase tracking-wider text-mute">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line/60 px-3 py-1.5 align-top">{children}</td>,
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[13px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
