import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from './api';
import { Mail, Lock, Key, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import AuthLayout from './AuthLayout';

export default function ForgotPassword() {
    const [step, setStep] = useState(1);
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
                new_password: newPassword,
            });
            setMessage('Password updated successfully. Redirecting to login…');
            setTimeout(() => navigate('/login'), 1800);
        } catch (err) {
            setError(err.response?.data?.detail || 'Reset failed. Please check your code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Reset your password"
            subtitle={
                step === 1
                    ? 'Enter your email and we will send a recovery code.'
                    : `Enter the code sent to ${email}.`
            }
        >
            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="success-message"
                >
                    <CheckCircle size={16} />
                    {message}
                </motion.div>
            )}

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

            {step === 1 ? (
                <form onSubmit={handleRequestReset}>
                    <div className="input-group">
                        <label className="input-label" htmlFor="email">Email address</label>
                        <div className="input-with-icon">
                            <Mail size={18} />
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                autoComplete="email"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                        disabled={loading}
                    >
                        {loading ? 'Sending…' : 'Send recovery code'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleVerifyAndReset}>
                    <div className="input-group">
                        <label className="input-label" htmlFor="code">Verification code</label>
                        <div className="input-with-icon">
                            <Key size={18} />
                            <input
                                id="code"
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="6-digit code"
                                required
                                maxLength={6}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="newPassword">New password</label>
                        <div className="input-with-icon">
                            <Lock size={18} />
                            <input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
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
                        {loading ? 'Updating…' : 'Reset password'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="btn-text"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                </form>
            )}

            <div className="auth-footer">
                Remembered your password? <Link to="/login">Sign in</Link>
            </div>
        </AuthLayout>
    );
}
