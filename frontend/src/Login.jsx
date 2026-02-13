import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from './api';
import { Rocket, Mail, Lock, LogIn, AlertCircle } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/login', { email, password });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('role', res.data.role);
            if (res.data.role === 'admin') {
                navigate('/admin/dashboard');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid email or password');
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
                <h2 className="auth-title">Welcome Back</h2>
                <p className="auth-subtitle">Continue your research journey</p>

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

                    <div className="input-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="input-label">Password</label>
                            <Link to="/forgot-password" style={{ fontSize: '0.75rem', color: 'var(--primary-color)', textDecoration: 'none' }}>
                                Forgot Password?
                            </Link>
                        </div>
                        <div className="input-with-icon">
                            <Lock size={18} className="text-muted" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                        {loading ? 'Authenticating...' : (
                            <>
                                <LogIn size={18} />
                                Sign In
                            </>
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    Don't have an account? <Link to="/signup">Create an Account</Link>
                </div>
            </motion.div>
        </div>
    );
}
