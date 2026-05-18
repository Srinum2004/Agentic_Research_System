import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Plus, Trash2, ArrowRight, Sparkles, UploadCloud } from 'lucide-react';
import Sidebar from './Sidebar';
import { papersApi } from './papersApi';

const STATUS_LABEL = {
    intent: 'Gathering intent',
    template_ready: 'Template ready',
    drafting: 'Drafting',
    done: 'Exported',
};

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// Render dates like "18ᵗʰ May 2026" with a Unicode superscript ordinal.
// 11/12/13 are the exceptions to the st/nd/rd rule.
function formatOrdinalDate(isoLike) {
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDate();
    const tens = day % 100;
    const ones = day % 10;
    let suffix = 'ᵗʰ';
    if (tens < 11 || tens > 13) {
        if (ones === 1) suffix = 'ˢᵗ';
        else if (ones === 2) suffix = 'ⁿᵈ';
        else if (ones === 3) suffix = 'ʳᵈ';
    }
    return `${day}${suffix} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function PapersList() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState(localStorage.getItem('role') || 'user');

    useEffect(() => {
        if (!localStorage.getItem('token')) {
            navigate('/login');
            return;
        }
        setRole(localStorage.getItem('role') || 'user');
        load();
    }, [navigate]);

    const load = async () => {
        setLoading(true);
        try {
            const rows = await papersApi.list();
            setProjects(rows);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const createNew = async () => {
        const proj = await papersApi.create();
        navigate(`/papers/new?id=${proj.id}`);
    };

    const remove = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Delete this paper and all its content?')) return;
        await papersApi.remove(id);
        load();
    };

    const openProject = (proj) => {
        if (proj.intent_complete) navigate(`/papers/${proj.id}`);
        else navigate(`/papers/new?id=${proj.id}`);
    };

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
                        <h1 className="hero-title">Paper Studio</h1>
                        <p className="text-muted">Draft, refine, and export publishable research papers with an AI co-author.</p>
                    </div>
                    <button className="btn btn-primary" onClick={createNew}>
                        <Plus size={18} /> New Paper
                    </button>
                </motion.header>

                {loading ? (
                    <div className="loading-screen">Loading your papers…</div>
                ) : projects.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="card"
                        style={{ textAlign: 'center', padding: '3rem 2rem' }}
                    >
                        <Sparkles size={32} style={{ marginBottom: '1rem', color: 'var(--primary-color)' }} />
                        <h3 style={{ marginBottom: '0.5rem' }}>No papers yet</h3>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Start a chat with the agent, lock in your research goal, and the canvas will draft your paper.
                        </p>
                        <button className="btn btn-primary" onClick={createNew}>
                            <Plus size={18} /> Start your first paper
                        </button>
                    </motion.div>
                ) : (
                    <div className="papers-grid">
                        {projects.map((p) => (
                            <motion.div
                                key={p.id}
                                whileHover={{ y: -2 }}
                                className="card paper-card"
                                onClick={() => openProject(p)}
                            >
                                <div className="paper-card-head">
                                    <div className="stat-icon" style={{ width: 36, height: 36 }}>
                                        {p.paper_type === 'uploaded' ? <UploadCloud size={18} /> : <FileText size={18} />}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                        {p.paper_type === 'uploaded' && (
                                            <span className="badge subtle" title="Imported from PDF/DOCX">
                                                <UploadCloud size={10} style={{ verticalAlign: '-1px', marginRight: '0.2rem' }} />
                                                Uploaded
                                            </span>
                                        )}
                                        <span className={`status-pill status-${p.status}`}>
                                            {STATUS_LABEL[p.status] || p.status}
                                        </span>
                                    </div>
                                </div>
                                <h3 className="paper-card-title">{p.title || 'Untitled Paper'}</h3>
                                <p className="text-muted paper-card-meta">
                                    {p.domain || 'Domain pending'} · {p.paper_type === 'uploaded' ? (p.paper_format || 'uploaded') : (p.paper_type || 'type pending')}
                                </p>
                                <div className="paper-card-foot">
                                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                        Updated {formatOrdinalDate(p.updated_at)}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            className="icon-btn"
                                            title="Delete"
                                            onClick={(e) => remove(p.id, e)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <button className="icon-btn primary" title="Open">
                                            <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
