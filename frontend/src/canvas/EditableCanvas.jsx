import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Renders an uploaded PDF page-by-page using PDF.js and overlays each text
// run as an editable element. The rasterised page stays as the background
// (so figures, equations, layout stay pixel-perfect), and the user can click
// any text run to rewrite it in place. Edited runs are visually replaced —
// the underlying canvas glyphs are masked by an opaque div so the user only
// sees the new text.
//
// onTextChange({ id, page, value, original }) fires when a run is committed.
export default function EditableCanvas({
    pdfUrl,
    scale = 1.5,
    onTextChange,
    onItemsReady,
    edits = {},
    focusedRunId = null,
}) {
    const [pages, setPages] = useState([]); // [{ pageNum, width, height, bgUrl, items }]
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);
    const reqIdRef = useRef(0);
    const itemsCallbackRef = useRef(onItemsReady);
    itemsCallbackRef.current = onItemsReady;
    const itemRefs = useRef({});  // runId -> DOM node, for scroll-into-view

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
                    const bgUrl = canvas.toDataURL('image/png');

                    const textContent = await page.getTextContent();
                    const items = textContent.items
                        .filter((it) => it.str && it.str.trim())
                        .map((it, idx) => {
                            // Compose the text item's own transform with the
                            // viewport transform to get screen-space coords.
                            const tx = pdfjsLib.Util.transform(
                                viewport.transform,
                                it.transform,
                            );
                            // Font size on screen = magnitude of the y-scale
                            // column (handles rotated text gracefully).
                            const fontSize = Math.hypot(tx[2], tx[3]);
                            const width = it.width * scale;
                            return {
                                id: `p${i}_t${idx}`,
                                page: i,
                                left: tx[4],
                                top: tx[5] - fontSize,
                                width: Math.max(width, 4),
                                height: fontSize * 1.2,
                                fontSize,
                                value: it.str,
                            };
                        });

                    out.push({
                        pageNum: i,
                        width: viewport.width,
                        height: viewport.height,
                        bgUrl,
                        items,
                    });
                }
                if (reqIdRef.current === reqId) {
                    setPages(out);
                    setLoading(false);
                    itemsCallbackRef.current?.(
                        out.flatMap((pg) => pg.items),
                    );
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

    // Scroll the focused text run into view and let it pulse (CSS handles
    // the animation via the .pdf-text-focused class). Re-runs whenever the
    // parent sets a new focusedRunId.
    useEffect(() => {
        if (!focusedRunId) return;
        const el = itemRefs.current[focusedRunId];
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focusedRunId, pages]);

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
                    className="pdf-page"
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
                    <div className="pdf-text-layer">
                        {p.items.map((item) => {
                            // Support both legacy string-edits and the new
                            // { original, new, page } shape so we don't
                            // break in-flight components mid-migration.
                            const rawEdit = edits[item.id];
                            const isEdited = rawEdit !== undefined && rawEdit !== null;
                            const editedValue = isEdited
                                ? (typeof rawEdit === 'object' ? rawEdit.new : rawEdit)
                                : undefined;
                            const display = isEdited ? editedValue : item.value;
                            const isEditing = editingId === item.id;
                            const isFocused = focusedRunId === item.id;

                            const sharedStyle = {
                                position: 'absolute',
                                left: item.left,
                                top: item.top,
                                minWidth: item.width,
                                height: item.height,
                                fontSize: item.fontSize,
                                lineHeight: 1,
                                whiteSpace: 'pre',
                            };

                            if (isEditing) {
                                return (
                                    <textarea
                                        key={item.id}
                                        autoFocus
                                        defaultValue={display}
                                        onBlur={(e) => {
                                            const next = e.target.value;
                                            setEditingId(null);
                                            if (next !== item.value || isEdited) {
                                                onTextChange?.({
                                                    id: item.id,
                                                    page: item.page,
                                                    value: next,
                                                    // Always send the run's original PDF text
                                                    // (not the current edited value) so the
                                                    // server can re-anchor on re-verify even
                                                    // after many in-session edits.
                                                    original: item.value,
                                                });
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
                                                e.preventDefault();
                                                setEditingId(null);
                                            }
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                            }
                                        }}
                                        style={{
                                            ...sharedStyle,
                                            width: Math.max(item.width + 40, 80),
                                            background: '#ffffff',
                                            color: '#111',
                                            border: '1.5px solid #4f8ef7',
                                            outline: 'none',
                                            padding: 0,
                                            margin: 0,
                                            resize: 'none',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                );
                            }

                            return (
                                <div
                                    key={item.id}
                                    ref={(node) => {
                                        if (node) itemRefs.current[item.id] = node;
                                        else delete itemRefs.current[item.id];
                                    }}
                                    role="textbox"
                                    tabIndex={0}
                                    onClick={() => setEditingId(item.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setEditingId(item.id);
                                        }
                                    }}
                                    className={
                                        'pdf-text-item'
                                        + (isEdited ? ' pdf-text-edited' : '')
                                        + (isFocused ? ' pdf-text-focused' : '')
                                    }
                                    style={{
                                        ...sharedStyle,
                                        color: isEdited ? '#111' : 'transparent',
                                        background: isEdited ? '#ffffff' : 'transparent',
                                    }}
                                    title="Click to edit"
                                >
                                    {display}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
