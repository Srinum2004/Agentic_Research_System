import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Sparkles,
    BookOpen,
    Beaker,
    BarChart3,
    Quote,
    FileWarning,
    Bot,
    Loader2,
    Layers,
    ListChecks,
    Circle,
    Download,
    RefreshCw,
} from 'lucide-react';

// Stage list shown in the progress checklist. Order matches engine.py emits.
const STAGES = [
    { id: 'structure',    label: 'Analysing section structure' },
    { id: 'references',   label: 'Cross-checking citations & references' },
    { id: 'word_counts',  label: 'Measuring section lengths' },
    { id: 'formatting',   label: 'Scanning for formatting issues' },
    { id: 'ai_tells',     label: 'Detecting AI writing patterns' },
    { id: 'repetition',   label: 'Checking phrase repetition' },
    { id: 'llm_judging',  label: 'Reviewer simulation (8 dimensions)' },
    { id: 'aggregating',  label: 'Compiling report' },
];

const DECISION_STYLE = {
    accept:          { label: 'Accept',         className: 'decision-accept',  icon: CheckCircle2,  note: "Ready for submission." },
    minor_revision:  { label: 'Minor Revision', className: 'decision-minor',   icon: AlertTriangle, note: "A few targeted fixes will get this over the line." },
    major_revision:  { label: 'Major Revision', className: 'decision-major',   icon: AlertTriangle, note: "Multiple sections need substantive work." },
    reject:          { label: 'Reject',         className: 'decision-reject',  icon: XCircle,       note: "Foundational issues — restructure before resubmitting." },
};

const RISK_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

function scoreClass(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'mid';
    if (score >= 40) return 'warn';
    return 'bad';
}

function ScoreTile({ label, value, suffix = '/100', accent }) {
    const tone = accent || scoreClass(value);
    return (
        <div className={`audit-tile audit-tile-${tone}`}>
            <div className="audit-tile-label">{label}</div>
            <div className="audit-tile-value">
                {value}<span className="audit-tile-suffix">{suffix}</span>
            </div>
            <div className="audit-tile-bar">
                <div className="audit-tile-bar-fill" style={{ width: `${Math.max(2, value)}%` }} />
            </div>
        </div>
    );
}

function RiskTile({ label, value }) {
    return (
        <div className={`audit-tile audit-tile-risk-${value}`}>
            <div className="audit-tile-label">{label}</div>
            <div className="audit-tile-value audit-tile-value-text">
                {RISK_LABELS[value] || value}
            </div>
            <div className="audit-tile-risk-dot" />
        </div>
    );
}

function DimensionCard({ title, score, icon: Icon, items }) {
    if (!items || items.length === 0) {
        return (
            <div className="audit-section-card audit-section-card-clean">
                <div className="audit-section-card-head">
                    <span className="audit-section-card-title">
                        <Icon size={14} /> {title}
                    </span>
                    {typeof score === 'number' && (
                        <span className={`audit-score-pill audit-score-${scoreClass(score)}`}>{score}</span>
                    )}
                </div>
                <div className="audit-section-card-clean-note">
                    <CheckCircle2 size={12} /> No issues detected
                </div>
            </div>
        );
    }
    return (
        <div className="audit-section-card">
            <div className="audit-section-card-head">
                <span className="audit-section-card-title">
                    <Icon size={14} /> {title}
                </span>
                {typeof score === 'number' && (
                    <span className={`audit-score-pill audit-score-${scoreClass(score)}`}>{score}</span>
                )}
            </div>
            <ul className="audit-section-card-list">
                {items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
        </div>
    );
}

function SectionFindingRow({ finding }) {
    const status = finding.status || 'ok';
    const Icon = status === 'fail' ? XCircle : status === 'warning' ? AlertTriangle : CheckCircle2;
    return (
        <div className={`audit-section-row audit-section-row-${status}`}>
            <Icon size={14} />
            <div className="audit-section-row-body">
                <div className="audit-section-row-title">
                    {finding.section_title}
                    <span className="audit-section-row-count">{finding.word_count} words</span>
                </div>
                {finding.issues?.length > 0 && (
                    <ul className="audit-section-row-issues">
                        {finding.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                    </ul>
                )}
            </div>
        </div>
    );
}

function ProgressChecklist({ stagesDone, currentStage, errorMessage }) {
    const currentIdx = STAGES.findIndex((s) => s.id === currentStage);
    return (
        <div className="audit-progress">
            <div className="audit-progress-head">
                <Loader2 size={20} className="spin" />
                <div>
                    <h3 style={{ margin: 0 }}>Running paper audit…</h3>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Deterministic checks complete in milliseconds. The reviewer simulation takes most of the time.
                    </p>
                </div>
            </div>
            <ol className="audit-progress-list">
                {STAGES.map((stage, i) => {
                    const done = stagesDone.has(stage.id);
                    const isCurrent = !done && (currentStage === stage.id ||
                        (currentIdx === -1 ? i === 0 : i === currentIdx));
                    return (
                        <li
                            key={stage.id}
                            className={
                                done ? 'audit-progress-done'
                                : isCurrent ? 'audit-progress-active'
                                : 'audit-progress-pending'
                            }
                        >
                            <span className="audit-progress-icon">
                                {done ? <CheckCircle2 size={14} />
                                    : isCurrent ? <Loader2 size={14} className="spin" />
                                    : <Circle size={14} />}
                            </span>
                            <span>{stage.label}</span>
                        </li>
                    );
                })}
            </ol>
            {errorMessage && (
                <div className="audit-error">
                    <AlertTriangle size={14} /> {errorMessage}
                </div>
            )}
        </div>
    );
}

export default function AuditReport({
    open,
    loading,
    audit,
    stagesDone,
    currentStage,
    errorMessage,
    onClose,
    onApplyImprovement,
    // Inline mode renders the report as a side panel (no modal overlay) so
    // it can sit next to the editable PDF canvas. The close button hides
    // the panel rather than dismissing a dialog.
    inline = false,
    applyingKey = null,
    // readOnly=true (uploaded papers) hides the Apply this fix buttons —
    // suggestions become pure text recommendations the user can act on
    // manually. Drafted papers leave readOnly=false so Paper Studio's
    // Apply-this-fix → chat-graph flow keeps working.
    readOnly = false,
    // Export the audit report itself (not the paper) as a downloadable PDF.
    onExportPdf = null,
    exporting = false,
    // Explicit re-run of the audit pipeline. Surfaced as a small button in
    // the header so the user has an opt-in path back to a fresh audit;
    // the toolbar's Verify Paper button no longer auto-re-runs.
    onRerun = null,
    // User's parsed sections — used to translate `imp.section_key` (canonical
    // bucket like "literature") back to the actual heading the user wrote
    // ("Related Work"). Falls back to the raw key if the section isn't
    // present yet.
    sections = null,
}) {
    const sectionTitleByKey = useMemo(() => {
        const map = {};
        for (const s of sections || []) map[s.key] = s.title;
        return map;
    }, [sections]);

    const report = audit?.report;
    const decisionMeta = report ? DECISION_STYLE[report.decision] || DECISION_STYLE.major_revision : null;

    const dimensionItems = useMemo(() => {
        if (!report) return null;
        return {
            title: [
                !report.title.is_specific && 'Title is too vague — not specific enough',
                report.title.is_clickbait && 'Title reads as clickbait',
                report.title.suggestion && `Suggested: "${report.title.suggestion}"`,
                ...(report.title.issues || []),
            ].filter(Boolean),
            abstract: [
                !report.abstract.has_problem && 'Missing problem statement',
                !report.abstract.has_method && 'Missing methodology',
                !report.abstract.has_results && 'Missing results / metric',
                !report.abstract.has_conclusion && 'Missing conclusion',
                ...(report.abstract.issues || []),
            ].filter(Boolean),
            literature: [
                !report.literature.has_gap_statement && 'No explicit research gap stated',
                `${report.literature.reference_count} reference entries detected`,
                ...(report.literature.issues || []),
            ].filter(Boolean),
            methodology: [
                !report.methodology.is_reproducible && 'Methodology not reproducible from text',
                !report.methodology.has_dataset_detail && 'Dataset details insufficient',
                ...(report.methodology.issues || []),
            ].filter(Boolean),
            results: [
                !report.results.has_quantitative_results && 'No quantitative results',
                !report.results.has_comparison && 'No baseline comparison',
                report.results.realism_concern && 'Numbers look unrealistic',
                ...(report.results.issues || []),
            ].filter(Boolean),
            citations: [
                `${report.citations.inline_markers} inline markers vs ${report.citations.reference_entries} entries`,
                report.citations.orphan_markers?.length > 0
                    && `Orphan markers (no entry): ${report.citations.orphan_markers.join(', ')}`,
                report.citations.uncited_entries?.length > 0
                    && `Uncited entries: ${report.citations.uncited_entries.join(', ')}`,
            ].filter(Boolean),
            formatting: [
                report.formatting.leftover_html_count > 0
                    && `${report.formatting.leftover_html_count} leftover styling HTML tag(s)`,
                report.formatting.asterisk_quote_count > 0
                    && `${report.formatting.asterisk_quote_count} *"…"* asterisk-quote patterns`,
                report.formatting.fence_wrap_count > 0
                    && `${report.formatting.fence_wrap_count} section(s) wrapped in code fences`,
                ...(report.formatting.issues || []),
            ].filter(Boolean),
            ai_tells: [
                ...(report.ai_tells.phrase_hits || []).map(
                    (h) => `Telltale phrase: ${h.phrase.replace(/\\b/g, '').replace(/\(\?:.*?\)/g, '')} × ${h.count}`,
                ),
                ...(report.ai_tells.issues || []),
            ].filter(Boolean),
        };
    }, [report]);

    if (!open) return null;

    const inner = (
        <>
            <div className="modal-header audit-header">
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck size={18} /> Research Paper Audit
                    </h2>
                    {report && (
                        <div className={`audit-decision-badge ${decisionMeta.className}`}>
                            <decisionMeta.icon size={16} /> {decisionMeta.label}
                        </div>
                    )}
                    {report && onRerun && (
                        <button
                            type="button"
                            className="btn btn-secondary audit-rerun-btn"
                            onClick={onRerun}
                            disabled={loading}
                            title="Run the audit again with the latest paper state"
                        >
                            <RefreshCw size={14} /> Re-run
                        </button>
                    )}
                    {report && onExportPdf && (
                        <button
                            type="button"
                            className="btn btn-primary audit-export-btn"
                            onClick={onExportPdf}
                            disabled={exporting}
                            title="Download this audit report as a PDF"
                        >
                            {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                            {' '}Export report
                        </button>
                    )}
                    <button className="close-btn" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body audit-body">
                    {loading && (
                        <ProgressChecklist
                            stagesDone={stagesDone || new Set()}
                            currentStage={currentStage}
                            errorMessage={errorMessage}
                        />
                    )}

                    {!loading && errorMessage && (
                        <div className="audit-error audit-error-large">
                            <AlertTriangle size={20} />
                            <div>
                                <strong>Audit failed</strong>
                                <div>{errorMessage}</div>
                            </div>
                        </div>
                    )}

                    {!loading && report && (
                        <AnimatePresence>
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35 }}
                            >
                                <div className="audit-decision-banner">
                                    <div className={`audit-decision-badge audit-decision-badge-large ${decisionMeta.className}`}>
                                        <decisionMeta.icon size={20} /> {decisionMeta.label}
                                    </div>
                                    <p className="audit-decision-note">{decisionMeta.note}</p>
                                </div>

                                <div className="audit-tiles">
                                    <ScoreTile label="Overall quality" value={report.overall_score} accent="primary" />
                                    <ScoreTile label="Ready to publish?" value={report.publication_readiness} />
                                    <ScoreTile label="How novel is the work" value={report.novelty_score} />
                                    <RiskTile label="Plagiarism risk" value={report.plagiarism_risk} />
                                    <RiskTile label="Looks AI-written?" value={report.ai_detection_risk} />
                                </div>

                                {report.critical_issues?.length > 0 && (
                                    <div className="audit-block audit-block-critical">
                                        <h3><AlertTriangle size={16} /> Most important things to fix</h3>
                                        <p className="audit-block-help">
                                            These are the issues that affect publishability the most. Fix these first.
                                        </p>
                                        <ol className="audit-critical-list">
                                            {report.critical_issues.map((c, i) => <li key={i}>{c}</li>)}
                                        </ol>
                                    </div>
                                )}

                                {report.improvements?.length > 0 && (
                                    <div className="audit-block">
                                        <h3><Sparkles size={16} /> Suggested improvements</h3>
                                        <p className="audit-block-help">
                                            Read each suggestion, then edit your paper offline. Use the priority badges to decide what to tackle first.
                                        </p>
                                        <div className="audit-improvements">
                                            {report.improvements.map((imp, i) => {
                                                const sectionLabel = imp.section_key
                                                    ? (sectionTitleByKey[imp.section_key] || imp.section_key)
                                                    : null;

                                                return (
                                                <div
                                                    key={i}
                                                    className={`audit-improvement audit-improvement-${imp.priority}`}
                                                >
                                                    <div className="audit-improvement-head">
                                                        <span className={`audit-priority audit-priority-${imp.priority}`}>{imp.priority}</span>
                                                        <span className="audit-improvement-title">{imp.title}</span>
                                                        {sectionLabel && (
                                                            <span className="audit-improvement-section">{sectionLabel}</span>
                                                        )}
                                                    </div>
                                                    {imp.detail && (
                                                        <div className="audit-improvement-detail">
                                                            <strong>What we found:</strong> {imp.detail}
                                                        </div>
                                                    )}
                                                    {imp.suggested_instruction && (
                                                        <div className="audit-improvement-detail audit-improvement-action">
                                                            <strong>Suggested action:</strong> {imp.suggested_instruction}
                                                        </div>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="audit-block">
                                    <h3><BookOpen size={16} /> How each part of the paper performs</h3>
                                    <p className="audit-block-help">
                                        Each card scores one part of the paper out of 100, with the main issues called out below the score.
                                    </p>
                                    <div className="audit-dimensions">
                                        <DimensionCard title="Title quality" score={report.title.score} icon={Quote} items={dimensionItems.title} />
                                        <DimensionCard title="Abstract completeness" score={report.abstract.score} icon={Quote} items={dimensionItems.abstract} />
                                        <DimensionCard title="Literature review depth" score={report.literature.score} icon={BookOpen} items={dimensionItems.literature} />
                                        <DimensionCard title="Methodology clarity" score={report.methodology.score} icon={Beaker} items={dimensionItems.methodology} />
                                        <DimensionCard title="Results & evidence" score={report.results.score} icon={BarChart3} items={dimensionItems.results} />
                                        <DimensionCard title="Citations & references" score={report.citations.score} icon={Quote} items={dimensionItems.citations} />
                                        <DimensionCard title="Formatting cleanliness" score={report.formatting.score} icon={FileWarning} items={dimensionItems.formatting} />
                                        <DimensionCard title="Sounds human (not AI-written)" score={report.ai_tells.score} icon={Bot} items={dimensionItems.ai_tells} />
                                    </div>
                                </div>

                                {report.section_findings?.length > 0 && (
                                    <div className="audit-block">
                                        <h3><Layers size={16} /> Section-by-section breakdown</h3>
                                        <p className="audit-block-help">
                                            What the audit found inside each section of your paper.
                                        </p>
                                        <div className="audit-section-rows">
                                            {report.section_findings.map((f, i) => (
                                                <SectionFindingRow key={i} finding={f} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(report.reviewer.strengths?.length > 0 || report.reviewer.weaknesses?.length > 0) && (
                                    <div className="audit-block">
                                        <h3><ListChecks size={16} /> What a reviewer would say</h3>
                                        <p className="audit-block-help">
                                            An AI reviewer's verdict on what your paper does well, what it doesn't, and what it must fix.
                                        </p>
                                        <div className="audit-reviewer-grid">
                                            {report.reviewer.strengths?.length > 0 && (
                                                <div className="audit-reviewer-block">
                                                    <div className="audit-reviewer-head" style={{ color: 'var(--secondary-color)' }}>
                                                        <CheckCircle2 size={14} /> Strengths
                                                    </div>
                                                    <ul>
                                                        {report.reviewer.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {report.reviewer.weaknesses?.length > 0 && (
                                                <div className="audit-reviewer-block">
                                                    <div className="audit-reviewer-head" style={{ color: 'var(--warning-color)' }}>
                                                        <AlertTriangle size={14} /> Weaknesses
                                                    </div>
                                                    <ul>
                                                        {report.reviewer.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {report.reviewer.required_corrections?.length > 0 && (
                                                <div className="audit-reviewer-block">
                                                    <div className="audit-reviewer-head" style={{ color: 'var(--error-color)' }}>
                                                        <XCircle size={14} /> Required Corrections
                                                    </div>
                                                    <ul>
                                                        {report.reviewer.required_corrections.map((r, i) => <li key={i}>{r}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="audit-footer-note">
                                    Audit v{audit?.meta?.version} · {new Date(audit?.meta?.created_at).toLocaleString()}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
        </>
    );

    if (inline) {
        return (
            <motion.div
                className="audit-inline"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
            >
                {inner}
            </motion.div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <motion.div
                className="modal-content audit-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
            >
                {inner}
            </motion.div>
        </div>
    );
}
