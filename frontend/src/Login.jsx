import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from './api';
import { Mail, LogIn, AlertCircle } from 'lucide-react';
import AuthLayout from './AuthLayout';
import PasswordInput from './PasswordInput';

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
            navigate(res.data.role === 'admin' ? '/admin/dashboard' : '/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Sign in to continue your research journey."
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

                <div className="input-group">
                    <div className="label-row">
                        <label className="input-label" htmlFor="password">Password</label>
                        <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
                    </div>
                    <PasswordInput
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                    />
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                    disabled={loading}
                >
                    {loading ? 'Signing in…' : (<><LogIn size={18} /> Sign in</>)}
                </button>
            </form>

            <div className="auth-footer">
                New to ThesiqX? <Link to="/signup">Create an account</Link>
            </div>
        </AuthLayout>
    );
}
