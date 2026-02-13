import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from './api';
import { Rocket, Lock, Key, AlertCircle, CheckCircle } from 'lucide-react';

export default function AcceptInvite() {
    const [inviteCode, setInviteCode] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/invite-verify', {
                invite_code: inviteCode,
                password
            });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('role', res.data.role);
            setSuccess(true);
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid invitation code or setup failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="auth-card"
            >
                <div className="sidebar-logo" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
                    <Rocket className="logo-icon" size={32} />
                    <span style={{ fontSize: '1.75rem' }}>Antigravity</span>
                </div>

                {success ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <div className="card-header-icon" style={{ margin: '0 auto 1.5rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--secondary-color)' }}>
                            <CheckCircle size={32} />
                        </div>
                        <h2 className="auth-title">Welcome Aboard!</h2>
                        <p className="auth-subtitle">Your account is ready. Redirecting you to the research hub...</p>
                    </div>
                ) : (
                    <>
                        <h2 className="auth-title">Join Workspace</h2>
                        <p className="auth-subtitle">Enter your invitation code to activate your account</p>

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="error-message"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <AlertCircle size={18} />
                                {error}
                            </motion.div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label className="input-label">Invitation Code</label>
                                <div className="input-with-icon">
                                    <Key size={18} className="text-muted" />
                                    <input
                                        type="text"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                        placeholder="8-character code"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Set Your Password</label>
                                <div className="input-with-icon">
                                    <Lock size={18} className="text-muted" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Secure password"
                                        required
                                        minLength={8}
                                    />
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                    Password must be at least 8 characters long.
                                </p>
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={loading}>
                                {loading ? 'Activating...' : 'Activate Account'}
                            </button>
                        </form>

                        <div className="auth-footer">
                            Receive an error? <Link to="/signup">Register manually</Link>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}
