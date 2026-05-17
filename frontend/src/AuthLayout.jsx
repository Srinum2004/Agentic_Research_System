import { motion } from 'framer-motion';
import { Sparkles, Search, BookOpenCheck, ShieldCheck, Sun, Moon } from 'lucide-react';
import useTheme from './useTheme';

const DEFAULT_FEATURES = [
    {
        icon: Search,
        title: 'Discover relevant literature',
        desc: 'Search across millions of papers and surface the ones that matter.',
    },
    {
        icon: Sparkles,
        title: 'Synthesise insights faster',
        desc: 'Let agents read, summarise and connect ideas while you focus on the thinking.',
    },
    {
        icon: BookOpenCheck,
        title: 'Draft & cite with confidence',
        desc: 'Verified references, structured outlines, ready for your next publication.',
    },
];

export default function AuthLayout({ title, subtitle, children, features = DEFAULT_FEATURES }) {
    const [theme, toggleTheme] = useTheme();

    return (
        <div className="auth-shell">
            <aside className="auth-brand">
                <div className="auth-brand-grid" aria-hidden="true" />
                <div className="auth-brand-top">
                    <div className="brand-logo">
                        <img src="/logo.svg" alt="ThesiqX" />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ShieldCheck size={14} /> Secure access
                    </span>
                </div>

                <motion.div
                    className="auth-brand-body"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    <span className="auth-brand-eyebrow">
                        <Sparkles size={12} /> AI Research Companion
                    </span>
                    <h1 className="auth-brand-headline">
                        Research, reimagined for <span className="accent">scholars</span> &amp; students.
                    </h1>
                    <p className="auth-brand-subhead">
                        ThesiqX helps you move from question to publication faster — explore sources, synthesise findings and draft with confidence.
                    </p>

                    <ul className="auth-feature-list">
                        {features.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <li className="auth-feature" key={feature.title}>
                                    <span className="auth-feature-icon">
                                        <Icon size={18} />
                                    </span>
                                    <div>
                                        <div className="auth-feature-title">{feature.title}</div>
                                        <div className="auth-feature-desc">{feature.desc}</div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </motion.div>

                <div className="auth-brand-footer">
                    <span>© {new Date().getFullYear()} ThesiqX</span>
                    <span>·</span>
                    <span>Built for research integrity</span>
                </div>
            </aside>

            <main className="auth-main">
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={toggleTheme}
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                <motion.div
                    className="auth-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="auth-mobile-logo">
                        <div className="brand-logo">
                            <img src="/logo.svg" alt="ThesiqX" />
                        </div>
                    </div>

                    <div className="auth-card-header">
                        <h2 className="auth-title">{title}</h2>
                        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
                    </div>

                    {children}
                </motion.div>
            </main>
        </div>
    );
}
