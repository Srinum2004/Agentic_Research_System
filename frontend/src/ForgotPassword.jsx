import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from './api';
import { Rocket, Mail, Lock, Key, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

export default function ForgotPassword() {
    const [step, setStep] = useState(1); // 1: Email, 2: Verification + New Password
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRequestReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await api.post('/auth/password-reset-request', { email });
            setStep(2);
            setMessage('A verification code has been sent to your email.');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to send reset code');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await api.post('/auth/password-reset-verify', {
                email,
                code,
                new_password: newPassword
            });
            setMessage('Password updated successfully! Redirecting to login...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.response?.data?.detail || 'Reset failed. Please check your code.');
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

                <h2 className="auth-title">Reset Password</h2>
                <p className="auth-subtitle">
                    {step === 1
                        ? "Enter your email to receive a recovery code"
                        : `Enter the code sent to ${email}`}
                </p>

                {message && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="success-message"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
                    >
                        <CheckCircle size={18} />
                        {message}
                    </motion.div>
                )}

                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="error-message"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
                    >
                        <AlertCircle size={18} />
                        {error}
                    </motion.div>
                )}

                {step === 1 ? (
                    <form onSubmit={handleRequestReset}>
                        <div className="input-group">
                            <label className="input-label">Email Address</label>
                            <div className="input-with-icon">
                                <Mail size={18} className="text-muted" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@company.com"
                                    required
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                            {loading ? 'Sending...' : 'Send Recovery Code'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyAndReset}>
                        <div className="input-group">
                            <label className="input-label">Verification Code</label>
                            <div className="input-with-icon">
                                <Key size={18} className="text-muted" />
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="6-digit code"
                                    required
                                    maxLength={6}
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label">New Password</label>
                            <div className="input-with-icon">
                                <Lock size={18} className="text-muted" />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimum 8 characters"
                                    required
                                    minLength={8}
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                            {loading ? 'Updating...' : 'Reset Password'}
                        </button>

                        <button type="button" onClick={() => setStep(1)} className="btn-text" style={{ width: '100%', marginTop: '1rem', fontSize: '0.8rem' }}>
                            <ArrowLeft size={14} style={{ marginRight: '0.5rem' }} /> Back
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    Remembered your password? <Link to="/login">Sign In</Link>
                </div>
            </motion.div>
        </div>
    );
}
