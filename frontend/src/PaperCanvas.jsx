import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, Sparkles, ChevronLeft, Target } from 'lucide-react';
import Sidebar from './Sidebar';
import CanvasToolbar from './canvas/CanvasToolbar';
import SectionCard from './canvas/SectionCard';
import PdfViewer from './canvas/PdfViewer';
import FigureUpload from './canvas/FigureUpload';
import AuditReport from './AuditReport';
import { papersApi, streamAudit, streamSectionDraft } from './papersApi';

export default function PaperCanvas() {
    const { id } = useParams();
    const projectId = Number(id);
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [sections, setSections] = useState([]);
    const [messages, setMessages] = useState([]);
    const [activeSectionKey, setActiveSectionKey] = useState(null);
    const [chatInput, setChatInput] = useState('');
    const [chatBusy, setChatBusy] = useState(false);
    const [draftingAll, setDraftingAll] = useState(false);
    const [showFigure, setShowFigure] = useState(false);
    const [role] = useState(localStorage.getItem('role') || 'user');
    const [auditOpen, setAuditOpen] = useState(false);
    const [auditLoading, setAuditLoading] = useState(false);
    const [audit, setAudit] = useState(null);
    const [auditStagesDone, setAuditStagesDone] = useState(new Set());
    const [auditCurrentStage, setAuditCurrentStage] = useState(null);
    const [auditError, setAuditError] = useState('');
    // For uploaded papers: presigned URL of the original source PDF. The
    // canvas now renders this read-only — no edit layer, no in-place
    // rewrites. All AI feedback lives in the audit report on the left.
    const [sourcePdfUrl, setSourcePdfUrl] = useState('');
    // Export-audit-report progress (toolbar button).
    const [exportingAudit, setExportingAudit] = useState(false);
    const scrollRef = useRef(null);

    const isUploaded = project?.paper_type === 'uploaded';

    useEffect(() => {
        if (!localStorage.getItem('token')) {
            navigate('/login');
            return;
        }
        load();
    }, [projectId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, chatBusy]);

    // For uploaded papers, fetch the original PDF asset so the canvas can
    // render the real file with an editable text overlay (instead of the
    // parsed section cards used for drafted papers).
    useEffect(() => {
        if (!project || project.paper_type !== 'uploaded') {
            setSourcePdfUrl('');
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const assets = await papersApi.listAssets(projectId);
                const src = assets.find(
                    (a) => a.kind === 'source' && (a.mime || '').includes('pdf'),
                );
                if (!cancelled) setSourcePdfUrl(src?.url || '');
            } catch {
                if (!cancelled) setSourcePdfUrl('');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [project, projectId]);

    const load = async () => {
        const detail = await papersApi.get(projectId);
        setProject(detail.project);
        setSections(detail.sections);
        setMessages(detail.messages);
        if (!detail.project.intent_complete) {
            navigate(`/papers/new?id=${projectId}`);
        }
        if (detail.sections[0] && !activeSectionKey) {
            setActiveSectionKey(detail.sections[0].key);
        }
    };

    const onSectionUpdate = useCallback((updated) => {
        setSections((prev) => prev.map((s) => (s.key === updated.key ? { ...s, ...updated } : s)));
    }, []);

    const onFocusSection = useCallback((sec) => setActiveSectionKey(sec.key), []);

    const scrollToSection = (key) => {
        if (!key) return;
        // Wait one frame so any newly-rendered card has been committed.
        requestAnimationFrame(() => {
            const el = document.querySelector(`[data-section-key="${key}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const submitChat = async (text, sectionKey) => {
        if (!text) return;
        setChatBusy(true);
        setMessages((prev) => [
            ...prev,
            { id: `tmp-${Date.now()}`, role: 'user', content: text, phase: 'edit' },
        ]);
        try {
            const resp = await papersApi.chat(projectId, text, {
                phase: 'edit',
                targetSectionKey: sectionKey || activeSectionKey,
            });
            setMessages((prev) => [
                ...prev,
                { id: `tmp-${Date.now()}-a`, role: 'assistant', content: resp.reply, phase: 'edit' },
            ]);
            if (resp.section_update) {
                onSectionUpdate(resp.section_update);
                scrollToSection(resp.section_update.key);
            }
            if (resp.state?.action === 'regenerate_section' && resp.state?.target_section_key) {
                scrollToSection(resp.state.target_section_key);
                regenerateOne(resp.state.target_section_key);
            }
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `err-${Date.now()}`,
                    role: 'assistant',
                    content: 'Something went wrong while editing.',
                    phase: 'edit',
                },
            ]);
        } finally {
            setChatBusy(false);
        }
    };

    const send = async (e) => {
        e?.preventDefault();
        const text = chatInput.trim();
        if (!text) return;
        setChatInput('');
        await submitChat(text, activeSectionKey);
    };

    const regenerateOne = (key) =>
        new Promise((resolve) => {
            let buffer = '';
            let flushScheduled = false;
            // Coalesce token deltas to one render per animation frame so the
            // main thread stays free for CSS animations (spinner) and other
            // sections' renders are skipped via React.memo.
            const flush = () => {
                flushScheduled = false;
                setSections((prev) =>
                    prev.map((s) => (s.key === key ? { ...s, body_md: buffer } : s))
                );
            };
            streamSectionDraft(
                projectId,
                key,
                (delta) => {
                    buffer += delta;
                    if (!flushScheduled) {
                        flushScheduled = true;
                        requestAnimationFrame(flush);
                    }
                },
                () => {
                    setSections((prev) =>
                        prev.map((s) =>
                            s.key === key
                                ? {
                                      ...s,
                                      body_md: buffer,
                                      version: (s.version || 1) + 1,
                                      word_count: buffer.split(/\s+/).filter(Boolean).length,
                                  }
                                : s
                        )
                    );
                    resolve();
                },
                () => resolve()
            );
        });

    const regenerateAll = async () => {
        if (!sections.length) return;
        setDraftingAll(true);
        try {
            for (const s of sections) {
                await regenerateOne(s.key);
            }
        } finally {
            setDraftingAll(false);
        }
    };

    // `runAudit` always fires a fresh audit pipeline. Use this for explicit
    // re-runs (the Re-run button inside the panel) or as a fallback when no
    // audit has been generated yet.
    const runAudit = () => {
        setAuditOpen(true);
        setAuditLoading(true);
        setAudit(null);
        setAuditStagesDone(new Set());
        setAuditCurrentStage(null);
        setAuditError('');

        // Stage order mirrors backend engine.py. As each new stage arrives,
        // mark every earlier one as done — derive from order so missed frames
        // don't leave a stage hanging in pending.
        const STAGE_ORDER = [
            'structure', 'references', 'word_counts', 'formatting',
            'ai_tells', 'repetition', 'llm_judging', 'aggregating',
        ];

        streamAudit(projectId, {
            onStage: ({ stage }) => {
                const idx = STAGE_ORDER.indexOf(stage);
                if (idx < 0) return;
                setAuditStagesDone(new Set(STAGE_ORDER.slice(0, idx)));
                setAuditCurrentStage(stage);
            },
            onDone: (auditDetail) => {
                setAuditStagesDone(new Set(STAGE_ORDER));
                setAuditCurrentStage(null);
                setAudit(auditDetail);
                setAuditLoading(false);
            },
            onError: (err) => {
                setAuditError(err.message || 'The audit failed to run.');
                setAuditLoading(false);
            },
        });
    };

    // What the toolbar's "Verify Paper" button does:
    //   - First click (no audit yet) → kick off the audit pipeline.
    //   - Once an audit exists → just toggle the panel's visibility. We
    //     never silently re-run the audit on subsequent clicks. To
    //     regenerate, the user must click the explicit Re-run button
    //     inside the panel.
    const toggleOrRunAudit = () => {
        if (auditLoading) return;          // already streaming, ignore
        if (!audit) {
            runAudit();
            return;
        }
        setAuditOpen((open) => !open);
    };

    // Drafted-paper "Apply this fix" still routes through the chat graph
    // so Paper Studio doesn't regress. Uploaded papers never call this —
    // the AuditReport is read-only and exports as PDF instead.
    const applyImprovementForDraft = async (imp) => {
        if (isUploaded) return;
        const text = (imp.suggested_instruction || imp.title || '').trim();
        if (imp.section_key) setActiveSectionKey(imp.section_key);
        setAuditOpen(false);
        scrollToSection(imp.section_key);
        if (!text) return;
        await submitChat(text, imp.section_key);
    };

    const exportAuditReport = async () => {
        if (!audit?.meta?.id || exportingAudit) return;
        setExportingAudit(true);
        try {
            const resp = await papersApi.exportAudit(projectId, audit.meta.id);
            if (resp?.url) {
                // New tab so the user keeps their audit panel state.
                window.open(resp.url, '_blank', 'noopener,noreferrer');
            }
        } catch (err) {
            /* could surface a toast — for the MVP, failure is silent and
               the user can retry by clicking Export again. */
        } finally {
            setExportingAudit(false);
        }
    };

    if (!project) return <div className="loading-screen">Loading paper…</div>;

    return (
        <div className="layout">
            <Sidebar role={role} />
            <main className="main-content paper-canvas-main">
                <div className="paper-canvas-head">
                    <button className="icon-btn" onClick={() => navigate('/papers')} title="Back">
                        <ChevronLeft size={16} />
                    </button>
                    <CanvasToolbar
                        project={project}
                        sections={sections}
                        onRegenerateAll={regenerateAll}
                        regenerating={draftingAll}
                        onUploadFigure={() => setShowFigure(true)}
                        onAudit={toggleOrRunAudit}
                        hasAudit={!!audit}
                        auditPanelOpen={auditOpen}
                        auditing={auditLoading}
                        readOnly={isUploaded}
                    />
                </div>

                {isUploaded ? (
                    <div
                        className={
                            'paper-canvas-split paper-canvas-uploaded'
                            + (auditOpen ? ' paper-canvas-uploaded-split' : '')
                        }
                    >
                        {auditOpen && (
                            <AuditReport
                                inline
                                open={auditOpen}
                                loading={auditLoading}
                                audit={audit}
                                stagesDone={auditStagesDone}
                                currentStage={auditCurrentStage}
                                errorMessage={auditError}
                                onClose={() => setAuditOpen(false)}
                                onExportPdf={exportAuditReport}
                                onRerun={runAudit}
                                exporting={exportingAudit}
                                sections={sections}
                                readOnly
                            />
                        )}
                        <div className="canvas-pane">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="canvas-paper"
                            >
                                <div className="canvas-cover">
                                    <h1>{project.title}</h1>
                                    <p className="text-muted">
                                        Imported paper · {{
                                            ieee_conference: 'IEEE Conference',
                                            acm_article: 'ACM Article',
                                            elsevier_journal: 'Elsevier Journal',
                                            apa_thesis: 'APA Thesis',
                                            generic: 'Generic format',
                                        }[project.paper_format] || project.paper_format || 'Unknown format'}
                                    </p>
                                    <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                                        Citation style: {project.citation_style?.toUpperCase()}
                                    </p>
                                </div>
                                {sourcePdfUrl ? (
                                    <PdfViewer pdfUrl={sourcePdfUrl} />
                                ) : (
                                    <div className="pdf-canvas-status">
                                        Loading original PDF…
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    </div>
                ) : (
                    <div className="paper-canvas-split">
                        <aside className="chat-pane canvas-chat">
                            <div className="chat-scroll" ref={scrollRef}>
                                {messages.map((m) => (
                                    <div key={m.id} className={`chat-bubble chat-${m.role}`}>
                                        {m.role === 'assistant' && (
                                            <div className="chat-avatar"><Sparkles size={12} /></div>
                                        )}
                                        <div className="chat-text">{m.content}</div>
                                    </div>
                                ))}
                                {chatBusy && (
                                    <div className="chat-bubble chat-assistant">
                                        <div className="chat-avatar"><Sparkles size={12} /></div>
                                        <div className="chat-text typing-dots"><span /><span /><span /></div>
                                    </div>
                                )}
                            </div>

                            {activeSectionKey && (
                                <div className="chat-focus">
                                    <Target size={12} /> Editing focus:{' '}
                                    <strong>{sections.find((s) => s.key === activeSectionKey)?.title}</strong>
                                </div>
                            )}

                            <form onSubmit={send} className="chat-input-row">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder='e.g. "rewrite intro more formally" or "add a comparison table"'
                                    disabled={chatBusy}
                                />
                                <button type="submit" className="btn btn-primary" disabled={chatBusy || !chatInput.trim()}>
                                    <Send size={14} />
                                </button>
                            </form>
                        </aside>

                        <div className="canvas-pane">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="canvas-paper"
                            >
                                <div className="canvas-cover">
                                    <h1>{project.title}</h1>
                                    <p className="text-muted">
                                        {project.domain} · {project.paper_type} · target: {project.journal_type}
                                    </p>
                                    <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                                        Citation style: {project.citation_style?.toUpperCase()}
                                    </p>
                                </div>
                                {sections.map((s) => (
                                    <SectionCard
                                        key={s.id}
                                        projectId={projectId}
                                        section={s}
                                        onUpdate={onSectionUpdate}
                                        onFocusSection={onFocusSection}
                                    />
                                ))}
                            </motion.div>
                        </div>
                    </div>
                )}

                {/* Drafted papers still use the audit as a modal — the canvas
                    is the section editor and a side panel would compete with
                    chat. Uploaded papers render the audit inline above. */}
                {!isUploaded && (
                    <AuditReport
                        open={auditOpen}
                        loading={auditLoading}
                        audit={audit}
                        stagesDone={auditStagesDone}
                        currentStage={auditCurrentStage}
                        errorMessage={auditError}
                        onClose={() => setAuditOpen(false)}
                        onApplyImprovement={applyImprovementForDraft}
                        onExportPdf={exportAuditReport}
                        exporting={exportingAudit}
                        sections={sections}
                    />
                )}

                {showFigure && (
                    <FigureUpload
                        projectId={projectId}
                        onClose={() => setShowFigure(false)}
                        onUploaded={(asset) => {
                            // Append a markdown image reference to the focused section, if any.
                            if (!activeSectionKey) return;
                            setSections((prev) =>
                                prev.map((s) =>
                                    s.key === activeSectionKey
                                        ? {
                                              ...s,
                                              body_md:
                                                  (s.body_md || '') +
                                                  `\n\n![${asset.label || 'Figure'}](${asset.url})\n\n*${asset.caption || ''}*`,
                                          }
                                        : s
                                )
                            );
                            // Persist the change.
                            const target = sections.find((s) => s.key === activeSectionKey);
                            if (target) {
                                papersApi.saveSection(
                                    projectId,
                                    activeSectionKey,
                                    (target.body_md || '') +
                                        `\n\n![${asset.label || 'Figure'}](${asset.url})\n\n*${asset.caption || ''}*`
                                );
                            }
                        }}
                    />
                )}
            </main>
        </div>
    );
}
