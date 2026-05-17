import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User,
    Lock,
    Shield,
    CheckCircle,
    Send
} from 'lucide-react';

export default function Settings() {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    // Request Modal State
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestedLimit, setRequestedLimit] = useState('');
    const [requestReason, setRequestReason] = useState('');
    const [requestLoading, setRequestLoading] = useState(false);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/user/profile');
            setProfile(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestLimit = async (e) => {
        e.preventDefault();
        setRequestLoading(true);
        try {
            await api.post('/user/request-limit', {
                request_type: 'limit',
                requested_limit: parseInt(requestedLimit),
                reason: requestReason
            });
            setShowRequestModal(false);
            setRequestedLimit('');
            setRequestReason('');
            alert('Request submitted successfully!');
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to submit request');
        } finally {
            setRequestLoading(false);
        }
    };

    const handleRequestPasswordReset = async () => {
        if (!window.confirm("Send a password reset code to your email? You will be logged out to complete the process.")) return;
        setRequestLoading(true);
        try {
            await api.post('/auth/password-reset-request', {
                email: profile.email
            });
            alert('A recovery code has been sent to your email. Redirecting to reset page...');
            localStorage.clear();
            navigate('/forgot-password');
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to send request');
        } finally {
            setRequestLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="layout">
            <Sidebar role={profile.role} />
            <main className="main-content">
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="page-header"
                >
                    <div>
                        <h1 className="hero-title">Account Settings</h1>
                        <p className="text-muted">Manage your profile, security, and usage quotas</p>
                    </div>
                </motion.header>

                <div className="settings-grid">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="card"
                        style={{ gridColumn: 'span 2' }}
                    >
                        <div className="profile-header">
                            <div className="avatar-large">
                                {profile.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>{profile.email.split('@')[0]}</h2>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)' }}>
                                        {profile.role.toUpperCase()}
                                    </span>
                                    <span className="text-dim" style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Shield size={14} /> Global Access
                                    </span>
                                </div>
                            </div>
                        </div>

                        <h3 className="settings-section-title"><User size={20} /> Personal Details</h3>
                        <div className="profile-info-grid">
                            <div className="info-box">
                                <div className="info-box-label">Email Address</div>
                                <div className="info-box-value">{profile.email}</div>
                            </div>
                            <div className="info-box">
                                <div className="info-box-label">Account Role</div>
                                <div className="info-box-value" style={{ textTransform: 'capitalize' }}>{profile.role}</div>
                            </div>
                            <div className="info-box">
                                <div className="info-box-label">Member Since</div>
                                <div className="info-box-value">{new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="card"
                    >
                        <h3 className="settings-section-title"><Shield size={20} /> Research Search Quota</h3>
                        <div className="usage-stats">
                            <div className="usage-circle">
                                <span className="usage-number">{profile.search_used}</span>
                                <span className="usage-of">/ {profile.search_limit}</span>
                            </div>
                            <p style={{ textAlign: 'center', margin: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                You have used <strong>{(profile.search_used / profile.search_limit * 100).toFixed(0)}%</strong> of your monthly search capacity.
                            </p>
                            <p style={{ textAlign: 'center', margin: '0 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                                Counts <strong>New Research</strong> queries (web &amp; literature search) only.
                                <br />Paper Studio drafting is a separate product and is not billed against this quota.
                            </p>

                            {profile.role === 'user' && (
                                <button
                                    className="btn btn-secondary"
                                    style={{ width: '100%' }}
                                    onClick={() => setShowRequestModal(true)}
                                >
                                    Increase My Limit
                                </button>
                            )}
                        </div>
                    </motion.div>

                    {profile.role === 'user' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="card"
                        >
                            <h3 className="settings-section-title"><Lock size={20} /> Security & Access</h3>
                            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                Request a secure password reset link or manage your authentication method.
                            </p>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={handleRequestPasswordReset}
                                disabled={requestLoading}
                            >
                                {requestLoading ? 'Sending Request...' : 'Request Password Reset'}
                            </button>
                        </motion.div>
                    )}

                    <AnimatePresence>
                        {showRequestModal && (
                            <div className="modal-overlay">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="auth-card modal-content"
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                        <h2 style={{ margin: 0 }}>Request Research Search Limit Increase</h2>
                                        <button onClick={() => setShowRequestModal(false)} className="btn-text" style={{ fontSize: '1.5rem' }}>×</button>
                                    </div>
                                    <form onSubmit={handleRequestLimit}>
                                        <div className="input-group">
                                            <label className="input-label">Requested Limit</label>
                                            <input
                                                type="number"
                                                value={requestedLimit}
                                                onChange={e => setRequestedLimit(e.target.value)}
                                                placeholder="e.g. 100"
                                                required
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Reason / Use Case</label>
                                            <textarea
                                                value={requestReason}
                                                onChange={e => setRequestReason(e.target.value)}
                                                placeholder="Please explain why you need a higher search volume..."
                                                style={{
                                                    width: '100%',
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: '1px solid var(--border-color)',
                                                    color: 'white',
                                                    minHeight: '120px',
                                                    fontFamily: 'inherit'
                                                }}
                                                required
                                            />
                                        </div>
                                        <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={requestLoading}>
                                            {requestLoading ? 'Sending...' : 'Submit Request'}
                                        </button>
                                    </form>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
