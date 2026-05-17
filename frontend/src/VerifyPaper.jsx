import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    UploadCloud,
    FileText,
    ShieldCheck,
    ArrowRight,
    AlertTriangle,
    X,
    CheckCircle2,
    Loader2,
} from 'lucide-react';
import Sidebar from './Sidebar';
import { papersApi } from './papersApi';

// Same preset list the intake picker uses, plus a "generic" option for
// papers that don't follow any of our supported formats.
const PAPER_TYPES = [
    { key: 'ieee_conference', name: 'IEEE Conference', citation: 'IEEE numeric', hint: 'Most CS conference papers (2-column).' },
    { key: 'acm_article',     name: 'ACM Article',     citation: 'ACM numeric',  hint: 'SIGCHI / CHI / acmart template.' },
    { key: 'elsevier_journal',name: 'Elsevier Journal',citation: 'Harvard',      hint: 'IMRaD journal, author-year refs.' },
    { key: 'apa_thesis',      name: 'APA Thesis',      citation: 'APA 7',        hint: 'Psychology / social sciences thesis.' },
    { key: 'generic',         name: 'Generic / Other', citation: 'Auto-detect',  hint: 'Any other research format.' },
];

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export default function VerifyPaper() {
    const navigate = useNavigate();
    const [role] = useState(localStorage.getItem('role') || 'user');
    const [paperType, setPaperType] = useState('generic');
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const fileInputRef = useRef(null);

    const pickFile = (f) => {
        setErrorMessage('');
        if (!f) return;
        const name = (f.name || '').toLowerCase();
        if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
            setErrorMessage('Only PDF or DOCX files are supported.');
            return;
        }
        if (f.size > MAX_BYTES) {
            setErrorMessage('File is larger than 15 MB.');
            return;
        }
        setFile(f);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        pickFile(e.dataTransfer.files?.[0]);
    };

    const startImport = async () => {
        if (!file) {
            setErrorMessage('Choose a paper file first.');
            return;
        }
        setBusy(true);
        setErrorMessage('');
        try {
            const meta = await papersApi.verifyUpload(file, paperType);
            // The canvas takes over from here: it can run Verify Paper, apply
            // per-section fixes, re-verify, and export — no need to re-upload.
            navigate(`/papers/${meta.id}`);
        } catch (err) {
            const detail =
                err?.response?.data?.detail ||
                err?.message ||
                'Could not import the paper.';
            setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
            setBusy(false);
        }
    };

    const selectedType = PAPER_TYPES.find((p) => p.key === paperType);

    return (
        <div className="layout">
            <Sidebar role={role} />
            <main className="main-content">
                <motion.header
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="page-header"
                >
                    <div>
                        <h1 className="hero-title">
                            <ShieldCheck size={22} style={{ verticalAlign: '-4px', marginRight: '0.5rem', color: 'var(--primary-color)' }} />
                            Verify Paper
                        </h1>
                        <p className="text-muted">
                            Import any research paper — AI-generated or hand-written. We&rsquo;ll parse it
                            into sections, open it in the editable canvas, and you can run the audit,
                            apply per-section fixes, re-verify, and export — all from one place.
                        </p>
                    </div>
                </motion.header>

                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card"
                    style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
                >
                    <div>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                            1. Paper format
                        </label>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: '0.75rem',
                            }}
                        >
                            {PAPER_TYPES.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setPaperType(t.key)}
                                    disabled={busy}
                                    className={`card`}
                                    style={{
                                        padding: '0.9rem 1rem',
                                        textAlign: 'left',
                                        cursor: busy ? 'not-allowed' : 'pointer',
                                        borderColor:
                                            paperType === t.key
                                                ? 'var(--primary-color)'
                                                : 'var(--border-color)',
                                        background:
                                            paperType === t.key
                                                ? 'var(--primary-soft)'
                                                : 'var(--surface-color)',
                                        transition: 'border-color .15s, background .15s',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                        <strong style={{ fontSize: '0.9rem' }}>{t.name}</strong>
                                        {paperType === t.key && (
                                            <CheckCircle2 size={14} style={{ color: 'var(--primary-color)' }} />
                                        )}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
                                        {t.citation}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>
                                        {t.hint}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                            2. Upload paper (PDF or DOCX, max 15 MB)
                        </label>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={onDrop}
                            onClick={() => !busy && fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragOver ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                background: dragOver ? 'var(--primary-soft)' : 'var(--surface-hover)',
                                borderRadius: 'var(--radius-lg, 12px)',
                                padding: '2rem 1.5rem',
                                textAlign: 'center',
                                cursor: busy ? 'not-allowed' : 'pointer',
                                transition: 'border-color .15s, background .15s',
                                opacity: busy ? 0.7 : 1,
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(e) => pickFile(e.target.files?.[0])}
                                style={{ display: 'none' }}
                                disabled={busy}
                            />
                            {file ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                                    <FileText size={22} style={{ color: 'var(--primary-color)' }} />
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{file.name}</div>
                                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                            {(file.size / 1024).toFixed(1)} KB
                                        </div>
                                    </div>
                                    {!busy && (
                                        <button
                                            type="button"
                                            className="icon-btn"
                                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                            title="Remove file"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <UploadCloud size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                                    <div style={{ fontSize: '0.9rem' }}>Drag &amp; drop your paper here, or click to browse</div>
                                    <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                        PDF or DOCX · up to 15 MB
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {errorMessage && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                background: 'rgba(244, 63, 94, 0.08)',
                                color: 'var(--error-color)',
                                fontSize: '0.85rem',
                            }}
                        >
                            <AlertTriangle size={14} /> {errorMessage}
                        </div>
                    )}

                    <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                        <strong>What happens next:</strong> We parse your file into editable
                        sections and open it in the canvas. From there, click <em>Verify Paper</em>
                        for the first audit, use <em>Apply this fix</em> on individual issues, then
                        re-verify and export the final paper as Markdown / DOCX / PDF. Your import is
                        stored, so re-verifying after fixes doesn&rsquo;t re-parse or re-upload anything.
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                            Selected: <strong>{selectedType?.name}</strong> · {selectedType?.citation}
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={startImport}
                            disabled={busy || !file}
                        >
                            {busy ? (
                                <>
                                    <Loader2 size={14} className="spin" /> Importing&hellip;
                                </>
                            ) : (
                                <>
                                    Import &amp; Open in Canvas <ArrowRight size={14} />
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
