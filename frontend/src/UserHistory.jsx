import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api';
import Sidebar from './Sidebar';
import AgentActivity from './AgentActivity';
import MarkdownView from './canvas/MarkdownView';
import {
    Clock,
    Zap,
    ExternalLink,
    X,
    FileText,
    Cpu,
    Search,
    ShieldCheck,
} from 'lucide-react';

// One row in the unified history feed. `kind` decides the badge, the
// click target (modal vs canvas navigation), and the meta column.
//   - research      → click opens a modal with the saved AgentLog
//   - paper_studio  → click navigates to /papers/{id} (drafted papers)
//   - verify_paper  → click navigates to /papers/{id} (uploaded papers,
//                     audit is already cached on the canvas)
const KIND_STYLE = {
    research:     { label: 'RESEARCH',     icon: Search,       bg: 'rgba(99, 102, 241, 0.12)',  color: 'var(--primary-color)' },
    paper_studio: { label: 'PAPER STUDIO', icon: FileText,     bg: 'rgba(34, 197, 94, 0.12)',   color: '#22c55e' },
    verify_paper: { label: 'VERIFY PAPER', icon: ShieldCheck,  bg: 'rgba(234, 179, 8, 0.12)',   color: '#eab308' },
};

export default function UserHistory() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            // Fetch research queries and paper projects in parallel. If
            // /papers 401s for some reason (e.g. token edge case), still
            // render whatever we got from /user/history.
            const [logsRes, papersRes] = await Promise.allSettled([
                api.get('/user/history'),
                api.get('/papers'),
            ]);

            const logs = logsRes.status === 'fulfilled' ? logsRes.value.data : [];
            const papers = papersRes.status === 'fulfilled' ? papersRes.value.data : [];

            const merged = [
                ...logs.map((log) => ({
                    kind: 'research',
                    id: `log-${log.id}`,
                    timestamp: log.created_at,
                    title: log.query,
                    meta: { execution_time: log.execution_time, used_web_search: log.used_web_search },
                    raw: log,
                })),
                ...papers.map((p) => ({
                    kind: p.paper_type === 'uploaded' ? 'verify_paper' : 'paper_studio',
                    id: `paper-${p.id}`,
                    timestamp: p.updated_at || p.created_at,
                    title: p.title || '(untitled paper)',
                    meta: {
                        paper_format: p.paper_format,
                        citation_style: p.citation_style,
                        num_sections: p.num_sections,
                    },
                    raw: p,
                })),
            ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            setItems(merged);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const openRow = (item) => {
        if (item.kind === 'research') {
            openReport(item.raw);
            return;
        }
        // Paper Studio / Verify Paper rows route to the canvas — audit is
        // already cached there so the report opens instantly.
        navigate(`/papers/${item.raw.id}`);
    };

    const openReport = (log) => {
        let resultData;
        try {
            // Attempt to parse if it's JSON (new format)
            resultData = JSON.parse(log.response);
        } catch (e) {
            // Fallback for old logs which only stored the output string
            resultData = {
                query: log.query,
                output: log.response,
                execution_time: log.execution_time,
                used_web_search: log.used_web_search,
                agent_steps: [],
                created_at: log.created_at
            };
        }
        setSelectedReport(resultData);
    };

    if (loading) return <div className="loading-screen">Retrieving Archives...</div>;

    return (
        <div className="layout">
            <Sidebar role="user" />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="hero-title">Research Library</h1>
                        <p className="text-muted">Review and manage your previous agent research and insights</p>
                    </div>
                </header>

                <div className="card" style={{ padding: '0' }}>
                    {items.length === 0 ? (
                        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                            <Clock size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                            <p>No activity yet. Run a search, draft a paper, or verify one to see it here.</p>
                        </div>
                    ) : (
                        <table className="user-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: '2.5rem' }}>Date & Time</th>
                                    <th>Type</th>
                                    <th>Title / Query</th>
                                    <th>Details</th>
                                    <th style={{ paddingRight: '2.5rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const style = KIND_STYLE[item.kind];
                                    const KindIcon = style.icon;
                                    const isResearch = item.kind === 'research';
                                    return (
                                        <tr key={item.id}>
                                            <td style={{ paddingLeft: '2.5rem' }}>
                                                <div style={{ fontWeight: 600 }}>{new Date(item.timestamp).toLocaleDateString()}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{new Date(item.timestamp).toLocaleTimeString()}</div>
                                            </td>
                                            <td>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.35rem',
                                                        background: style.bg,
                                                        color: style.color,
                                                        fontSize: '0.7rem',
                                                        padding: '3px 8px',
                                                        letterSpacing: '0.04em',
                                                    }}
                                                >
                                                    <KindIcon size={11} /> {style.label}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 500, maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                                                    {item.title}
                                                </div>
                                            </td>
                                            <td>
                                                {isResearch ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <Clock size={12} className="text-dim" /> {item.meta.execution_time}
                                                        {item.meta.used_web_search && (
                                                            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', fontSize: '0.65rem', padding: '2px 6px' }}>
                                                                WEB SEARCH
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {item.meta.paper_format || 'generic'}
                                                        {item.meta.citation_style && ` · ${String(item.meta.citation_style).toUpperCase()}`}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ paddingRight: '2.5rem', textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                                    onClick={() => openRow(item)}
                                                >
                                                    {isResearch ? 'View Report' : 'Open Canvas'} <ExternalLink size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            {/* Report Modal */}
            {selectedReport && (
                <div className="modal-overlay" onClick={() => setSelectedReport(null)}>
                    <div className="modal-content report-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div className="stat-icon" style={{ margin: 0, width: 40, height: 40, background: 'var(--primary-glow)', color: 'var(--primary-color)' }}>
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>Research Report</h3>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>{selectedReport.query}</p>
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => setSelectedReport(null)}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="card result-card" style={{ marginBottom: '2rem' }}>
                                <div className="result-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div className="stat-icon" style={{ margin: 0, width: 40, height: 40 }}><Cpu size={20} /></div>
                                        <h3 className="result-title">Research Summary</h3>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <span className="meta-item"><Clock size={14} style={{ marginRight: 4 }} /> {selectedReport.execution_time}</span>
                                        {selectedReport.used_web_search && <span className="meta-item web"><Zap size={14} style={{ marginRight: 4 }} /> Web Search Used</span>}
                                    </div>
                                </div>
                                <div className="result-content md-content">
                                    <MarkdownView>{selectedReport.output}</MarkdownView>
                                </div>
                            </div>

                            <AgentActivity result={selectedReport} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

