import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Read-only PDF render. Mirrors the previous EditableCanvas page raster
// pipeline but skips the per-text-run overlay entirely — the audit panel
// on the left is now the only interactive surface, and the PDF on the right
// is purely a "what you uploaded" reference view.
export default function PdfViewer({ pdfUrl, scale = 1.5 }) {
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const reqIdRef = useRef(0);

    useEffect(() => {
        if (!pdfUrl) {
            setPages([]);
            setLoading(false);
            return;
        }
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setError('');
        setPages([]);

        (async () => {
            try {
                const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
                const pdf = await loadingTask.promise;
                const out = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    if (reqIdRef.current !== reqId) return;
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);
                    await page.render({
                        canvasContext: canvas.getContext('2d'),
                        viewport,
                    }).promise;
                    out.push({
                        pageNum: i,
                        width: viewport.width,
                        height: viewport.height,
                        bgUrl: canvas.toDataURL('image/png'),
                    });
                }
                if (reqIdRef.current === reqId) {
                    setPages(out);
                    setLoading(false);
                }
            } catch (e) {
                if (reqIdRef.current === reqId) {
                    setError(e?.message || String(e));
                    setLoading(false);
                }
            }
        })();

        return () => {
            // Bump the request id so any in-flight render bails out.
            reqIdRef.current++;
        };
    }, [pdfUrl, scale]);

    if (loading) {
        return (
            <div className="pdf-canvas-status">
                <Loader2 size={16} className="spin" /> Rendering PDF…
            </div>
        );
    }
    if (error) {
        return (
            <div className="pdf-canvas-status pdf-canvas-error">
                <AlertTriangle size={14} /> Could not render PDF: {error}
            </div>
        );
    }
    if (!pages.length) {
        return <div className="pdf-canvas-status">No PDF to display.</div>;
    }

    return (
        <div className="pdf-canvas-wrap">
            {pages.map((p) => (
                <div
                    key={p.pageNum}
                    className="pdf-page pdf-page-readonly"
                    style={{ width: p.width, height: p.height }}
                >
                    <img
                        src={p.bgUrl}
                        alt={`Page ${p.pageNum}`}
                        width={p.width}
                        height={p.height}
                        draggable={false}
                        className="pdf-page-bg"
                    />
                </div>
            ))}
        </div>
    );
}
