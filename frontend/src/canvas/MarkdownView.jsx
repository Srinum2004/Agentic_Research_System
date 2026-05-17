import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    suppressErrorRendering: true,
});

let mermaidSeq = 0;
const nextId = () => `mermaid-${Date.now()}-${++mermaidSeq}`;

// Fix common LLM-introduced mermaid syntax mistakes so diagrams actually
// render. We're conservative — only touching patterns that are unambiguously
// wrong.
function sanitizeMermaid(src) {
    let out = src || '';
    // Any closing edge-label pipe immediately followed by one or more `>`
    // is the LLM's most common mistake (e.g. `-->|produces|>`). The closing
    // `|` already terminates the label in real mermaid; the extra `>` breaks
    // the parser.
    out = out.replace(/\|>+/g, '|');
    // Collapse runs of arrowheads at the end of an arrow: `-->>` → `-->`,
    // `==>>` → `==>` (only on edges, not in node labels).
    out = out.replace(/(--+)>{2,}/g, '$1>');
    out = out.replace(/(={2,})>{2,}/g, '$1>');
    // Strip a bare leading "mermaid" header some models emit by mistake.
    out = out.replace(/^\s*mermaid\s*\n/i, '');
    return out;
}

function MermaidBlock({ code }) {
    const ref = useRef(null);
    const idRef = useRef(nextId());
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const sanitized = sanitizeMermaid((code || '').trim());
        if (!sanitized) {
            setError('Empty diagram');
            return;
        }
        (async () => {
            try {
                // Validate first so we don't trigger mermaid's global error renderer.
                const ok = await mermaid.parse(sanitized, { suppressErrors: true });
                if (ok === false) {
                    if (!cancelled) setError('Invalid mermaid syntax');
                    return;
                }
                const { svg } = await mermaid.render(idRef.current, sanitized);
                if (!cancelled && ref.current) {
                    ref.current.innerHTML = svg;
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) setError(e?.message || 'Failed to render diagram');
            }
        })();
        return () => {
            cancelled = true;
            // Mermaid may inject helper nodes by id — remove any stragglers.
            try {
                const stray = document.getElementById(idRef.current);
                if (stray && stray.parentNode && stray.parentNode !== ref.current) {
                    stray.parentNode.removeChild(stray);
                }
            } catch {}
        };
    }, [code]);

    if (error) {
        return (
            <div className="mermaid-fallback">
                <div className="mermaid-fallback-title">
                    Diagram could not be rendered
                </div>
                <div className="mermaid-fallback-msg">{error}</div>
                <pre>{code}</pre>
            </div>
        );
    }
    return <div ref={ref} className="mermaid-diagram" />;
}

export default function MarkdownView({ children }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
                code({ className, children: c, node }) {
                    const language = /language-(\w+)/.exec(className || '')?.[1];
                    const text = String(c ?? '').replace(/\n$/, '');
                    // react-markdown v9 no longer passes `inline` — derive it from the AST node.
                    const isBlock =
                        node?.position && node.position.start.line !== node.position.end.line;
                    if (isBlock && language === 'mermaid') {
                        return <MermaidBlock code={text} />;
                    }
                    if (!isBlock) {
                        return <code className={className}>{c}</code>;
                    }
                    return <code className={className}>{c}</code>;
                },
                pre({ children: c }) {
                    return <pre>{c}</pre>;
                },
                table({ children: c }) {
                    return (
                        <div className="md-table-wrap">
                            <table className="md-table">{c}</table>
                        </div>
                    );
                },
            }}
        >
            {children || ''}
        </ReactMarkdown>
    );
}
