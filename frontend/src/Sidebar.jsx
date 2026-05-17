import { useEffect, useState } from 'react';
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
    Bell,
    FileText,
    FileCheck,
    Sun,
    Moon,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import useTheme from './useTheme';

export default function Sidebar({ role }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [theme, toggleTheme] = useTheme();
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === '1';
    });

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    }, [collapsed]);

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
        { name: 'Paper Studio', path: '/papers', icon: FileText },
        { name: 'Verify Paper', path: '/verify', icon: FileCheck },
        { name: 'My History', path: '/history', icon: History },
        { name: 'My Profile', path: '/profile', icon: User },
        { name: 'Notifications', path: '/notifications', icon: Bell },
    ];

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            <div className="sidebar-logo">
                <img src="/logo.svg" alt="ThesiqX" className="brand-logo-img" />
                {isAdmin && !collapsed && <ShieldCheck size={14} style={{ color: 'var(--primary-color)', marginLeft: '-4px' }} />}
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <div
                        key={item.path}
                        className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                        title={collapsed ? item.name : undefined}
                    >
                        <item.icon size={20} />
                        <span className="nav-label">{item.name}</span>
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
                <div
                    className="nav-item theme-toggle-item"
                    onClick={toggleTheme}
                    role="button"
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    <span className="nav-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </div>

                <div
                    className="nav-item logout"
                    onClick={handleLogout}
                    title={collapsed ? 'Logout' : undefined}
                >
                    <LogOut size={20} />
                    <span className="nav-label">Logout</span>
                </div>

                {!collapsed && (
                    <div className="account-type-box">
                        <div className="account-type-label">Account Type</div>
                        <div className="account-type-value">
                            {localStorage.getItem('role') === 'admin' ? 'Administrator' : 'Standard User'}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
