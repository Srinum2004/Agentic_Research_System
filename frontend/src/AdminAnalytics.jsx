import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import {
    Clock,
    Zap,
    Search as SearchIcon,
    ChevronRight,
    ArrowLeft
} from 'lucide-react';

export default function AdminAnalytics() {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/admin/users');
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const viewUserAnalytics = async (user) => {
        setSelectedUser(user);
        setLoading(true);
        try {
            const res = await api.get(`/admin/users/${user.id}/analytics`);
            setAnalytics(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (selectedUser && analytics) {
        return (
            <div className="layout">
                <Sidebar role="admin" />
                <main className="main-content">
                    <div style={{ marginBottom: '2rem' }}>
                        <button className="btn btn-secondary" onClick={() => { setSelectedUser(null); setAnalytics(null); }} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
                            <ArrowLeft size={18} /> Back to All Users
                        </button>
                    </div>

                    <header className="page-header" style={{ marginBottom: '2.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-color)', border: '1px solid var(--border-color)' }}>
                                {selectedUser.email.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="hero-title" style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>{selectedUser.email}</h1>
                                <p className="text-muted">Detailed activity tracking and research history</p>
                            </div>
                        </div>
                    </header>

                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon"><SearchIcon size={20} /></div>
                            <div className="stat-value">{analytics.user.search_used}</div>
                            <div className="stat-label">Total Searches</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ color: 'var(--secondary-color)', background: 'rgba(16, 185, 129, 0.1)' }}><Zap size={20} /></div>
                            <div className="stat-value">{analytics.user.search_limit}</div>
                            <div className="stat-label">Limit Capacity</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{
                                color: analytics.user.is_active ? 'var(--secondary-color)' : 'var(--error-color)',
                                background: analytics.user.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)'
                            }}>
                                <Clock size={20} />
                            </div>
                            <div className="stat-value" style={{ color: analytics.user.is_active ? 'var(--secondary-color)' : 'var(--error-color)' }}>
                                {analytics.user.is_active ? 'Active' : 'Disabled'}
                            </div>
                            <div className="stat-label">Account Status</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Research Query History</h2>
                            <span className="text-muted" style={{ fontSize: '0.9rem' }}>Showing latest {analytics.history.length} searches</span>
                        </div>

                        <div className="card" style={{ padding: '0' }}>
                            {analytics.history.length === 0 ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    <Clock size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                                    <p>This user hasn't performed any research yet.</p>
                                </div>
                            ) : (
                                <table className="user-table">
                                    <thead>
                                        <tr>
                                            <th style={{ paddingLeft: '2rem' }}>Date & Time</th>
                                            <th>Query / Intent</th>
                                            <th>Performance</th>
                                            <th style={{ paddingRight: '2rem' }}>Results & Sources</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.history.map((log, idx) => (
                                            <tr key={log.id}>
                                                <td style={{ paddingLeft: '2rem' }}>
                                                    <div style={{ fontSize: '0.85rem' }}>{new Date(log.created_at).toLocaleDateString()}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{new Date(log.created_at).toLocaleTimeString()}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.query}>
                                                        {log.query}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <Clock size={12} className="text-dim" /> {log.execution_time}
                                                        {log.used_web_search && (
                                                            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', fontSize: '0.65rem', padding: '2px 6px' }}>
                                                                WEB
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ paddingRight: '2rem' }}>
                                                    <div className="text-muted" style={{ fontSize: '0.8rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {(() => {
                                                            try {
                                                                const res = JSON.parse(log.response);
                                                                return res.output || log.response;
                                                            } catch (e) {
                                                                return log.response;
                                                            }
                                                        })()}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="layout">
            <Sidebar role="admin" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="hero-title">Usage & Analytics</h1>
                        <p className="text-muted">Track search performance and credit consumption per user</p>
                    </div>
                </header>

                <div className="card" style={{ padding: '0' }}>
                    <table className="user-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: '2.5rem' }}>User Profile</th>
                                <th>Credit Usage</th>
                                <th>Status</th>
                                <th style={{ paddingRight: '2.5rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user, idx) => (
                                <tr key={user.id}>
                                    <td style={{ paddingLeft: '2.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)', fontWeight: 700, fontSize: '0.8rem' }}>
                                                {user.email.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{user.email}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div className="usage-meter-progress" style={{ width: 100, height: 6, margin: 0 }}>
                                                <div
                                                    className="usage-meter-bar"
                                                    style={{
                                                        width: `${Math.min((user.search_used / user.search_limit) * 100, 100)}%`,
                                                        background: user.search_used >= user.search_limit ? 'var(--error-color)' : 'var(--primary-color)'
                                                    }}
                                                />
                                            </div>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                                {user.search_used} <span className="text-dim">/ {user.search_limit}</span>
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className={`status-pill ${user.is_active ? 'active' : 'inactive'}`} style={{ transform: 'scale(0.9)', transformOrigin: 'left' }}>
                                            {user.is_active ? 'Active' : 'Disabled'}
                                        </div>
                                    </td>
                                    <td style={{ paddingRight: '2.5rem', textAlign: 'right' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => viewUserAnalytics(user)}
                                            style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                        >
                                            View Logs <ChevronRight size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
