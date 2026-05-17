import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Pencil,
    Eye,
    RefreshCw,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Save,
    Loader2,
} from 'lucide-react';
import MarkdownView from './MarkdownView';
import { papersApi, streamSectionDraft } from '../papersApi';

function SectionCardImpl({ projectId, section, onUpdate, onFocusSection }) {
    const [mode, setMode] = useState('preview'); // preview | edit
    const [draft, setDraft] = useState(section.body_md || '');
    const [showGuidance, setShowGuidance] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [justUpdated, setJustUpdated] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        setDraft(section.body_md || '');
    }, [section.id, section.version]);

    // Flash the card briefly when its version increments (i.e. an external
    // edit, regeneration, or Apply-this-fix landed). Skip the very first
    // render — we only want to highlight *changes*, not the initial paint.
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        setJustUpdated(true);
        const t = setTimeout(() => setJustUpdated(false), 2400);
        return () => clearTimeout(t);
    }, [section.version]);

    const wordCount = (draft || '').trim().split(/\s+/).filter(Boolean).length;

    const save = async () => {
        setSaving(true);
        try {
            const updated = await papersApi.saveSection(projectId, section.key, draft);
            onUpdate(updated);
            setMode('preview');
        } finally {
            setSaving(false);
        }
    };

    const regenerate = () => {
        setStreaming(true);
        setDraft('');
        let buffer = '';
        streamSectionDraft(
            projectId,
            section.key,
            (delta) => {
                buffer += delta;
                setDraft(buffer);
            },
            () => {
                setStreaming(false);
                onUpdate({ ...section, body_md: buffer, version: (section.version || 1) + 1, word_count: buffer.split(/\s+/).filter(Boolean).length });
            },
            () => setStreaming(false)
        );
    };

    const guidance = section.guidance || {};

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`canvas-section ${justUpdated ? 'canvas-section-flash' : ''}`}
            data-section-key={section.key}
            onClick={() => onFocusSection?.(section)}
        >
            <div className="canvas-section-head">
                <div>
                    <div className="canvas-section-order">Section {section.order}</div>
                    <h2 className="canvas-section-title">{section.title}</h2>
                </div>
                <div className="canvas-section-actions">
                    <span className="badge subtle">{wordCount} words · v{section.version}</span>
                    <button
                        className="icon-btn"
                        title={mode === 'edit' ? 'Preview' : 'Edit'}
                        onClick={(e) => {
                            e.stopPropagation();
                            setMode(mode === 'edit' ? 'preview' : 'edit');
                        }}
                    >
                        {mode === 'edit' ? <Eye size={14} /> : <Pencil size={14} />}
                    </button>
                    <button
                        className="icon-btn"
                        title="Regenerate with AI"
                        onClick={(e) => {
                            e.stopPropagation();
                            regenerate();
                        }}
                        disabled={streaming}
                    >
                        {streaming ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            <button
                className="canvas-guidance-toggle"
                onClick={(e) => {
                    e.stopPropagation();
                    setShowGuidance((s) => !s);
                }}
            >
                {showGuidance ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Guidance
            </button>
            <AnimatePresence>
                {showGuidance && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="canvas-guidance"
                    >
                        {guidance.purpose && <p><strong>Purpose:</strong> {guidance.purpose}</p>}
                        {guidance.word_limit && <p><strong>Word limit:</strong> {guidance.word_limit}</p>}
                        {Array.isArray(guidance.what_to_include) && guidance.what_to_include.length > 0 && (
                            <div>
                                <strong>What to include:</strong>
                                <ul>{guidance.what_to_include.map((b, i) => <li key={i}>{b}</li>)}</ul>
                            </div>
                        )}
                        {Array.isArray(guidance.common_mistakes) && guidance.common_mistakes.length > 0 && (
                            <div>
                                <strong>Common mistakes:</strong>
                                <ul>{guidance.common_mistakes.map((b, i) => <li key={i}>{b}</li>)}</ul>
                            </div>
                        )}
                        {guidance.formatting_notes && <p><em>{guidance.formatting_notes}</em></p>}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="canvas-section-body">
                {mode === 'edit' ? (
                    <>
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={Math.max(8, Math.min(36, (draft.match(/\n/g) || []).length + 4))}
                            placeholder="Section markdown… use ```mermaid for diagrams, | tables | for tables."
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => { setDraft(section.body_md || ''); setMode('preview'); }}>Cancel</button>
                            <button className="btn btn-primary" onClick={save} disabled={saving}>
                                {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save
                            </button>
                        </div>
                    </>
                ) : draft ? (
                    <MarkdownView>{draft}</MarkdownView>
                ) : (
                    <div className="canvas-empty">
                        <Sparkles size={14} /> Click <RefreshCw size={12} /> to draft this section with AI.
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// Shallow-compare children: when one section streams in tokens, only that
// card re-renders. Sibling cards' `section` props keep their reference
// (PaperCanvas.map returns the same object for untouched sections), so they
// skip render entirely — keeps the spinner animation smooth.
export default memo(SectionCardImpl);
