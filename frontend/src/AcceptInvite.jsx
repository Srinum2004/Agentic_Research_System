import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from './api';
import { Lock, Key, AlertCircle, CheckCircle } from 'lucide-react';
import AuthLayout from './AuthLayout';

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
                password,
            });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('role', res.data.role);
            setSuccess(true);
            // Route by role so invited admins land on the admin dashboard,
            // not the user-facing one. Matches Login.jsx's redirect.
            const landing = res.data.role === 'admin' ? '/admin/dashboard' : '/dashboard';
            setTimeout(() => navigate(landing), 1800);
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid invitation code or setup failed');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <AuthLayout
                title="Welcome aboard!"
                subtitle="Your account is ready. Redirecting you to the research hub…"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="success-message"
                    style={{ justifyContent: 'center' }}
                >
                    <CheckCircle size={18} />
                    Account activated successfully.
                </motion.div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Join workspace"
            subtitle="Enter your invitation code to activate your account."
        >
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="error-message"
                >
                    <AlertCircle size={16} />
                    {error}
                </motion.div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="input-group">
                    <label className="input-label" htmlFor="invite">Invitation code</label>
                    <div className="input-with-icon">
                        <Key size={18} />
                        <input
                            id="invite"
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="8-character code"
                            required
                        />
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label" htmlFor="password">Set your password</label>
                    <div className="input-with-icon">
                        <Lock size={18} />
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            required
                            minLength={8}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                    disabled={loading}
                >
                    {loading ? 'Activating…' : 'Activate account'}
                </button>
            </form>

            <div className="auth-footer">
                Receive an error? <Link to="/signup">Register manually</Link>
            </div>
        </AuthLayout>
    );
}
