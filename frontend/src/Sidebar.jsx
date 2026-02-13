import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    History,
    Settings,
    LogOut,
    User,
    ShieldCheck,
    BarChart3,
    Users,
    Rocket,
    Bell
} from 'lucide-react';

export default function Sidebar({ role }) {
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        navigate('/login');
    };

    const isAdmin = role === 'admin';

    const menuItems = isAdmin ? [
        { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'User Activity', path: '/admin/analytics', icon: BarChart3 },
        { name: 'Manage Users', path: '/admin/users', icon: Users },
        { name: 'Requests', path: '/admin/requests', icon: Rocket },
        { name: 'Settings', path: '/admin/settings', icon: Settings },
    ] : [
        { name: 'New Research', path: '/dashboard', icon: Rocket },
        { name: 'My History', path: '/history', icon: History },
        { name: 'My Profile', path: '/profile', icon: User },
        { name: 'Notifications', path: '/notifications', icon: Bell },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <Rocket className="logo-icon" size={24} />
                <span>Antigravity</span>
                {isAdmin && <ShieldCheck size={14} style={{ color: 'var(--primary-color)', marginLeft: '-4px' }} />}
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <div
                        key={item.path}
                        className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                    >
                        <item.icon size={20} />
                        <span>{item.name}</span>
                        {location.pathname === item.path && (
                            <motion.div
                                layoutId="sidebar-active"
                                className="active-indicator"
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    width: '3px',
                                    height: '20px',
                                    background: 'var(--primary-color)',
                                    borderRadius: '0 4px 4px 0'
                                }}
                            />
                        )}
                    </div>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="nav-item logout" onClick={handleLogout}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </div>

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
                        Account Type
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {localStorage.getItem('role') === 'admin' ? 'Administrator' : 'Standard User'}
                    </div>
                </div>
            </div>
        </aside>
    );
}
