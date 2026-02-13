import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from './api';
import { Rocket, Mail, Lock, UserPlus, Shield, Key, AlertCircle } from 'lucide-react';

export default function Signup() {
    const [step, setStep] = useState(1); // 1: Email, 2: Verification + Password
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('user');
    const [adminSecret, setAdminSecret] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRequestCode = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post('/auth/signup-request', { email });
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to send verification code. Please check your email.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/verify-signup', {
                email,
                code,
                password,
                role,
                admin_secret: adminSecret
            });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('role', res.data.role);
            if (res.data.role === 'admin') {
                navigate('/admin/dashboard');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Verification failed');
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
                <h2 className="auth-title">{step === 1 ? 'Verify Email' : 'Complete Setup'}</h2>
                <p className="auth-subtitle">
                    {step === 1
                        ? 'We will send a code to your neural link (email)'
                        : `Enter the 6-digit code sent to ${email}`}
                </p>

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

                {step === 1 ? (
                    <form onSubmit={handleRequestCode}>
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
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={loading}>
                            {loading ? 'Sending Code...' : 'Get Verification Code'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyAndSignup}>
                        <div className="input-group">
                            <label className="input-label">Verification Code</label>
                            <div className="input-with-icon">
                                <Key size={18} className="text-muted" />
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="6-digit code"
                                    maxLength={6}
                                    required
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Set Password</label>
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
                        </div>

                        <div className="input-group">
                            <label className="input-label">Assign Role</label>
                            <div className="input-with-icon">
                                <Shield size={18} className="text-muted" />
                                <select value={role} onChange={(e) => setRole(e.target.value)}>
                                    <option value="user">Standard User</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                        </div>

                        <AnimatePresence>
                            {role === 'admin' && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="input-group"
                                >
                                    <label className="input-label">Admin Secret Key</label>
                                    <div className="input-with-icon">
                                        <Key size={18} className="text-muted" />
                                        <input
                                            type="password"
                                            value={adminSecret}
                                            onChange={(e) => setAdminSecret(e.target.value)}
                                            placeholder="Admin Secret Key"
                                            required={role === 'admin'}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={loading}>
                            {loading ? 'Creating Account...' : 'Complete Registration'}
                        </button>

                        <button type="button" onClick={() => setStep(1)} className="btn-text" style={{ width: '100%', marginTop: '1rem', fontSize: '0.8rem' }}>
                            Changed email? Go back
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    Already registered? <Link to="/login">Sign In</Link>
                </div>
            </motion.div>
        </div>
    );
}
