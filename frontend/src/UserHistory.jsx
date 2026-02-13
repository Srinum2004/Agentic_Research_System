import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import AgentActivity from './AgentActivity';
import {
    Clock,
    Calendar,
    Zap,
    ExternalLink,
    X,
    FileText,
    Cpu
} from 'lucide-react';

export default function UserHistory() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await api.get('/user/history');
            setHistory(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
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
                    {history.length === 0 ? (
                        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                            <Clock size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                            <p>You haven't performed any research yet. Visit the dashboard to get started!</p>
                        </div>
                    ) : (
                        <table className="user-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: '2.5rem' }}>Date & Time</th>
                                    <th>Research Query</th>
                                    <th>Performance</th>
                                    <th style={{ paddingRight: '2.5rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((log, idx) => (
                                    <tr key={log.id}>
                                        <td style={{ paddingLeft: '2.5rem' }}>
                                            <div style={{ fontWeight: 600 }}>{new Date(log.created_at).toLocaleDateString()}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{new Date(log.created_at).toLocaleTimeString()}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 500, maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.query}>
                                                {log.query}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                <Clock size={12} className="text-dim" /> {log.execution_time}
                                                {log.used_web_search && (
                                                    <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', fontSize: '0.65rem', padding: '2px 6px' }}>
                                                        WEB SEARCH
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ paddingRight: '2.5rem', textAlign: 'right' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                                onClick={() => openReport(log)}
                                            >
                                                View Report <ExternalLink size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
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
                                <div className="result-content" style={{ whiteSpace: 'pre-wrap' }}>
                                    {selectedReport.output}
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

