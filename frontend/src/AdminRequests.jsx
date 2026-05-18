import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import { motion } from 'framer-motion';
import {
    CheckCircle,
    XCircle,
    Clock,
    User,
    Zap,
    ExternalLink,
    Rocket
} from 'lucide-react';

export default function AdminRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const res = await api.get('/admin/requests');
            setRequests(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (requestId, status) => {
        try {
            await api.post(`/admin/requests/${requestId}/handle`, { status });
            fetchRequests();
        } catch (err) {
            alert('Action failed');
        }
    };

    return (
        <div className="layout">
            <Sidebar role="admin" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="hero-title">Credit Requests</h1>
                        <p className="text-muted">Review and manage user search limit requests</p>
                    </div>
                </header>

                <div className="card" style={{ padding: '0' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '4rem' }}>Loading requests...</div>
                    ) : requests.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                            <Rocket size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                            <p>No pending requests at the moment.</p>
                        </div>
                    ) : (
                        <table className="user-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: '2.5rem' }}>User Profile</th>
                                    <th>Request Type</th>
                                    <th>Detail / Reason</th>
                                    <th>Status</th>
                                    <th>Applied On</th>
                                    <th style={{ paddingRight: '2.5rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map((req, idx) => (
                                    <motion.tr
                                        key={req.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <td style={{ paddingLeft: '2.5rem' }}>
                                            <div style={{ fontWeight: 600 }}>{req.user_email}</div>
                                        </td>
                                        <td>
                                            <span className={`badge ${req.request_type}`} style={{
                                                background: req.request_type === 'limit' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                                                color: req.request_type === 'limit' ? 'var(--primary-color)' : 'var(--error-color)'
                                            }}>
                                                {req.request_type === 'limit' ? 'LIMIT INCREASE' : 'PASSWORD RESET'}
                                            </span>
                                        </td>
                                        <td>
                                            {req.request_type === 'limit' ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span className="text-dim">{req.current_limit}</span>
                                                    <Zap size={12} className="text-primary" />
                                                    <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                                                        {(req.current_limit || 0) + (req.requested_limit || 0)}
                                                    </span>
                                                    <span className="text-dim" style={{ fontSize: '0.75rem' }}>
                                                        (+{req.requested_limit})
                                                    </span>
                                                </div>
                                            ) : (
                                                <div style={{ maxWidth: 200, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {req.reason}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-pill ${req.status}`}>
                                                {req.status.capitalize()}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td style={{ paddingRight: '2.5rem', textAlign: 'right' }}>
                                            {req.status === 'pending' && (
                                                <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => handleAction(req.id, 'approved')}
                                                        className="btn-icon success"
                                                        title="Approve / Done"
                                                    >
                                                        <CheckCircle size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(req.id, 'rejected')}
                                                        className="btn-icon delete"
                                                        title="Reject"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}

// Helper
String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
}
