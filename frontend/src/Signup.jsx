import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from './api';
import { Mail, Lock, Shield, Key, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import AuthLayout from './AuthLayout';

export default function Signup() {
    const [step, setStep] = useState(1);
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
                admin_secret: adminSecret,
            });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('role', res.data.role);
            navigate(res.data.role === 'admin' ? '/admin/dashboard' : '/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={step === 1 ? 'Create your account' : 'Verify & complete setup'}
            subtitle={
                step === 1
                    ? 'Join researchers using ThesiqX to publish faster.'
                    : `Enter the 6-digit code we sent to ${email}.`
            }
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

            {step === 1 ? (
                <form onSubmit={handleRequestCode}>
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
                        {loading ? 'Sending code…' : (<>Continue <ArrowRight size={16} /></>)}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleVerifyAndSignup}>
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
                                maxLength={6}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="password">Create password</label>
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

                    <div className="input-group">
                        <label className="input-label" htmlFor="role">Account type</label>
                        <div className="input-with-icon">
                            <Shield size={18} />
                            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                                <option value="user">Standard user</option>
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
                                style={{ overflow: 'hidden' }}
                            >
                                <label className="input-label" htmlFor="adminSecret">Admin secret</label>
                                <div className="input-with-icon">
                                    <Key size={18} />
                                    <input
                                        id="adminSecret"
                                        type="password"
                                        value={adminSecret}
                                        onChange={(e) => setAdminSecret(e.target.value)}
                                        placeholder="Admin secret key"
                                        required={role === 'admin'}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                        disabled={loading}
                    >
                        {loading ? 'Creating account…' : 'Complete registration'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="btn-text"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                    >
                        <ArrowLeft size={14} /> Use a different email
                    </button>
                </form>
            )}

            <div className="auth-footer">
                Already have an account? <Link to="/login">Sign in</Link>
            </div>
        </AuthLayout>
    );
}
