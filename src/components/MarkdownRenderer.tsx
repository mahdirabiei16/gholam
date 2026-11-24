import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  text: string;
}

const CodeBlock: React.FC<{ lang: string; code: string }> = ({ lang, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div dir="ltr" className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0b0d12]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#141824] px-3.5 py-2 text-xs text-slate-400">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-slate-300 transition-colors hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#1fe0c5]" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'کپی شد' : 'کپی کد'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-xs leading-6 text-slate-200 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInlineFormatting(line: string): React.ReactNode[] {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-bold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          dir="ltr"
          className="mx-0.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-[#1fe0c5]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  const segments = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-sm leading-7 text-slate-100">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;
          return <CodeBlock key={segIdx} lang={lang} code={code.trimEnd()} />;
        }

        const lines = segment.split('\n');
        return (
          <div key={segIdx} className="space-y-1.5">
            {lines.map((rawLine, lineIdx) => {
              const line = rawLine.trimEnd();
              if (!line.trim()) {
                return <div key={lineIdx} className="h-1" />;
              }

              if (line.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="pt-1 text-base font-bold text-white">
                    {renderInlineFormatting(line.slice(4))}
                  </h4>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <h3 key={lineIdx} className="pt-1.5 text-lg font-bold text-white">
                    {renderInlineFormatting(line.slice(3))}
                  </h3>
                );
              }
              if (line.startsWith('# ')) {
                return (
                  <h2 key={lineIdx} className="pt-2 text-xl font-extrabold text-white">
                    {renderInlineFormatting(line.slice(2))}
                  </h2>
                );
              }
              if (line.startsWith('> ')) {
                return (
                  <blockquote
                    key={lineIdx}
                    className="rounded-lg bg-white/[0.04] px-3 py-2 text-slate-300"
                  >
                    {renderInlineFormatting(line.slice(2))}
                  </blockquote>
                );
              }
              if (/^[-*•]\s+/.test(line.trimStart())) {
                const content = line.trimStart().replace(/^[-*•]\s+/, '');
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pr-1">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1fe0c5]" />
                    <span className="flex-1">{renderInlineFormatting(content)}</span>
                  </div>
                );
              }
              if (/^\d+[.)]\s+/.test(line.trimStart())) {
                const match = line.trimStart().match(/^(\d+[.)])\s+(.*)$/);
                if (match) {
                  return (
                    <div key={lineIdx} className="flex items-start gap-2 pr-1">
                      <span className="shrink-0 font-semibold text-[#ff7a2f] tabular-nums">
                        {match[1]}
                      </span>
                      <span className="flex-1">{renderInlineFormatting(match[2])}</span>
                    </div>
                  );
                }
              }

              return <p key={lineIdx}>{renderInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};
