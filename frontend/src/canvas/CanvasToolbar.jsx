import { useState } from 'react';
import { Download, RefreshCw, Loader2, Image as ImageIcon, ShieldCheck, UploadCloud, Eye, EyeOff } from 'lucide-react';
import { papersApi } from '../papersApi';

// Pretty-print preset keys so the toolbar doesn't show "ieee_conference".
const FORMAT_LABELS = {
    ieee_conference: 'IEEE Conference',
    acm_article: 'ACM Article',
    elsevier_journal: 'Elsevier Journal',
    apa_thesis: 'APA Thesis',
    generic: 'Generic',
};

export default function CanvasToolbar({
    project,
    sections = [],
    onExport,
    onRegenerateAll,
    regenerating,
    onUploadFigure,
    onAudit,
    auditing,
    hasAudit = false,        // an audit has already been generated this session
    auditPanelOpen = false,  // the audit panel is currently visible
    readOnly = false,
}) {
    const canAudit = sections.some((s) => (s.body_md || '').trim());
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    const isUploaded = project.paper_type === 'uploaded';
    const formatLabel = FORMAT_LABELS[project.paper_format] || project.paper_format || '';
    const subtitle = isUploaded
        ? [formatLabel || 'Imported paper', project.citation_style?.toUpperCase()].filter(Boolean).join(' · ')
        : [project.domain, project.paper_type, project.citation_style?.toUpperCase()].filter(Boolean).join(' · ');

    const handleExport = async (format) => {
        setOpen(false);
        setBusy(true);
        try {
            const out = await papersApi.export(project.id, format);

            const safeTitle =
                (project.title || 'paper')
                    .replace(/[^a-z0-9_-]+/gi, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '') || 'paper';
            const baseName = (out.key || '').split('/').pop() || `paper.${out.format}`;
            const filename = `${safeTitle}_${baseName}`;

            try {
                // Fetch the presigned URL as a blob, then trigger a real
                // Save dialog via <a download>. Blob URLs are same-origin,
                // so the download attribute is honoured.
                const res = await fetch(out.url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            } catch (err) {
                // CORS or network failure — fall back to opening the URL.
                console.warn('Blob download failed, falling back to window.open', err);
                window.open(out.url, '_blank');
            }

            onExport?.(out);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="canvas-toolbar">
            <div className="canvas-meta">
                <span className="paper-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {isUploaded && <UploadCloud size={14} style={{ color: 'var(--primary-color)' }} aria-label="Imported paper" />}
                    {project.title}
                </span>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {isUploaded ? 'Imported' : null}{isUploaded ? ' · ' : null}{subtitle}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* Drafted papers (Paper Studio) keep the full toolbar — Draft
                    all / Figure / Export work against the editable section
                    cards. Uploaded papers are read-only verification only:
                    just the Verify Paper button is shown. */}
                {!readOnly && (
                    <>
                        <button
                            className="btn btn-secondary"
                            onClick={onRegenerateAll}
                            disabled={regenerating}
                            title="Draft every empty section"
                        >
                            {regenerating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Draft all
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={onUploadFigure}
                            title="Upload figure"
                        >
                            <ImageIcon size={14} /> Figure
                        </button>
                    </>
                )}
                <button
                    className="btn btn-primary"
                    onClick={onAudit}
                    disabled={auditing || !canAudit}
                    title={
                        auditing
                            ? "Audit is running…"
                            : !canAudit
                            ? (readOnly
                                ? "Couldn't extract any text from this paper to audit"
                                : "Draft at least one section before auditing")
                            : hasAudit
                            ? (auditPanelOpen ? "Hide the audit report" : "Show the audit report")
                            : "Run a 12-point audit of the paper"
                    }
                >
                    {/* Three visual states: streaming, panel open, panel closed-but-has-audit, never-run. */}
                    {auditing ? (
                        <>
                            <Loader2 size={14} className="spin" /> Verifying…
                        </>
                    ) : hasAudit ? (
                        <>
                            {auditPanelOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                            {' '}{auditPanelOpen ? 'Hide report' : 'Show report'}
                        </>
                    ) : (
                        <>
                            <ShieldCheck size={14} /> Verify Paper
                        </>
                    )}
                </button>
                {!readOnly && (
                    <div style={{ position: 'relative' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => setOpen((s) => !s)}
                            disabled={busy}
                        >
                            {busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Export
                        </button>
                        {open && (
                            <div className="dropdown-menu">
                                <button onClick={() => handleExport('md')}>Markdown (.md)</button>
                                <button onClick={() => handleExport('docx')}>Word (.docx)</button>
                                <button onClick={() => handleExport('pdf')}>PDF (.pdf)</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
