import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from './api';
import Sidebar from './Sidebar';
import AgentActivity from './AgentActivity';
import MarkdownView from './canvas/MarkdownView';
import { Search, Sparkles, AlertCircle, Cpu, Zap, Timer, Globe } from 'lucide-react';

export default function Dashboard() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }
        fetchProfile();
    }, [navigate]);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/user/profile');
            setProfile(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const runResearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setResult(null);
        setError('');

        try {
            const res = await api.post('/research', { query });
            setResult(res.data);
            fetchProfile();
        } catch (err) {
            setError(err.response?.data?.detail || 'Research task failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!profile) return <div className="loading-screen">Preparing your workspace...</div>;

    const limitReached = profile.role !== 'admin' && profile.search_used >= profile.search_limit;

    return (
        <div className="layout">
            <Sidebar role={profile.role} />

            <main className="main-content">
                <motion.header
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="page-header"
                >
                    <div>
                        <h1 className="hero-title">Research Dashboard</h1>
                        <p className="text-muted">Explore the web with autonomous AI</p>
                    </div>

                    <div className="usage-meter card" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="stat-label" style={{ fontSize: '0.7rem' }}>Research Search Credits</span>
                            <span className="usage-meter-text">{profile.search_used} / {profile.search_limit}</span>
                        </div>
                        <div className="usage-meter-progress">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(profile.search_used / profile.search_limit) * 100}%` }}
                                transition={{ duration: 1 }}
                                className="usage-meter-bar"
                            />
                        </div>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                            For web &amp; literature search only — Paper Studio is independent.
                        </p>
                    </div>
                </motion.header>

                <div className="research-container">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="card research-box"
                    >
                        <form onSubmit={runResearch}>
                            <div className="input-with-icon">
                                <Search className="text-dim" size={24} />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Enter research objective (e.g. 'Future of Quantum Computing')"
                                    disabled={loading || limitReached}
                                />
                                <button type="submit" className="btn btn-primary" disabled={loading || limitReached || !query.trim()}>
                                    {loading ? <Sparkles className="spin" /> : (
                                        <>
                                            <Zap size={18} />
                                            Start Research
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>

                        <AnimatePresence>
                            {limitReached && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="limit-warning"
                                    style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '0.75rem', borderRadius: '10px' }}
                                >
                                    <AlertCircle size={18} />
                                    <span>Quota exhausted. Contact administrator for additional neural cycles.</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {error && <div className="error-message" style={{ marginTop: '1rem' }}>{error}</div>}
                    </motion.div>

                    <AnimatePresence>
                        {loading && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="agent-status-card card"
                                style={{ textAlign: 'center', borderColor: 'var(--primary-glow)' }}
                            >
                                <div className="pulse-loader"></div>
                                <h3 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>AI is researching...</h3>
                                <p className="text-muted">Searching the web and analyzing data to find the best answer for you.</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {result && !loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="result-container"
                        >
                            <div className="card result-card">
                                <div className="result-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div className="stat-icon" style={{ margin: 0, width: 40, height: 40 }}><Cpu size={20} /></div>
                                        <h3 className="result-title">Research Summary</h3>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <span className="meta-item"><Timer size={14} style={{ marginRight: 4 }} /> {result.execution_time}</span>
                                        {result.used_web_search && <span className="meta-item web"><Globe size={14} style={{ marginRight: 4 }} /> Web Search Used</span>}
                                    </div>
                                </div>
                                <div className="result-content md-content">
                                    <MarkdownView>{result.output}</MarkdownView>
                                </div>
                            </div>

                            <div style={{ marginTop: '3rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <Zap size={20} className="logo-icon" />
                                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Agent Activity</h3>
                                </div>
                                <AgentActivity result={result} />
                            </div>
                        </motion.div>
                    )}
                </div>
            </main>
        </div>
    );
}
