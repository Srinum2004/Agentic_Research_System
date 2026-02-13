import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell,
    CheckCircle,
    AlertTriangle,
    Info,
    MessageSquare,
    Check
} from 'lucide-react';

export default function UserNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const role = localStorage.getItem('role');

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            setNotifications(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const markRead = async (id) => {
        try {
            await api.post(`/notifications/${id}/read`);
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch (err) {
            console.error(err);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle className="text-success" size={20} />;
            case 'warning': return <AlertTriangle className="text-warning" size={20} />;
            case 'request': return <MessageSquare className="text-primary" size={20} />;
            default: return <Info className="text-info" size={20} />;
        }
    };

    return (
        <div className="layout">
            <Sidebar role={role} />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="hero-title">Notifications</h1>
                        <p className="text-muted">Stay updated with your account activity</p>
                    </div>
                </header>

                <div className="notifications-list">
                    {loading ? (
                        <div className="card" style={{ textAlign: 'center' }}>Loading...</div>
                    ) : notifications.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '3rem' }}>
                            <Bell size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                            <p>You're all caught up! No new notifications.</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {notifications.map((notif, idx) => (
                                <motion.div
                                    key={notif.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`notification-card ${notif.is_read ? 'read' : 'unread'}`}
                                >
                                    <div className="notif-icon-wrapper">
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="notif-content">
                                        <div className="notif-header">
                                            <span className="notif-title">{notif.title}</span>
                                            <span className="notif-time">{new Date(notif.created_at).toLocaleString()}</span>
                                        </div>
                                        <p className="notif-message">{notif.message}</p>
                                    </div>
                                    {!notif.is_read && (
                                        <button className="read-btn" onClick={() => markRead(notif.id)} title="Mark as read">
                                            <Check size={16} />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </main>
        </div>
    );
}
