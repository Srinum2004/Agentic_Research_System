import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    Globe,
    Zap,
    UserPlus,
    TrendingUp,
    Cpu,
    ArrowUpRight
} from 'lucide-react';
import {
    PieChart, Pie, Cell,
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function AdminDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const res = await api.get('/admin/dashboard');
            setData(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loading-screen">Loading dashboard data...</div>;

    const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b'];

    return (
        <div className="layout">
            <Sidebar role="admin" />

            <main className="main-content">
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="page-header"
                >
                    <div>
                        <h1 className="hero-title">Admin Dashboard</h1>
                        <p className="text-muted">Overview of platform usage and user activity</p>
                    </div>
                </motion.header>

                <div className="stats-grid">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="stat-card">
                        <div className="stat-icon"><Users /></div>
                        <div className="stat-value">{data.metrics.total_users}</div>
                        <div className="stat-label">Active Users</div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="stat-card">
                        <div className="stat-icon"><Globe /></div>
                        <div className="stat-value">{data.metrics.total_queries}</div>
                        <div className="stat-label">Total Searches</div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="stat-card">
                        <div className="stat-icon"><TrendingUp /></div>
                        <div className="stat-value">{data.metrics.web_search_rate.toFixed(1)}%</div>
                        <div className="stat-label">Web Search Rate</div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="stat-card">
                        <div className="stat-icon"><UserPlus /></div>
                        <div className="stat-value">{data.metrics.admin_created}</div>
                        <div className="stat-label">Created by Admin</div>
                    </motion.div>
                </div>

                <div className="charts-grid">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="chart-card card"
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h3 style={{ margin: 0 }}>Signup Sources</h3>
                            <ArrowUpRight size={18} className="text-dim" />
                        </div>
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.charts.user_distribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.charts.user_distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: '12px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem' }}>
                            {data.charts.user_distribution.map((entry, index) => (
                                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[index % COLORS.length] }} />
                                    <span className="text-muted">{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                        className="chart-card card"
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h3 style={{ margin: 0 }}>Most Active Users</h3>
                            <Cpu size={18} className="text-dim" />
                        </div>
                        <div style={{ height: 350, marginTop: '1rem' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.charts.queries_per_user} margin={{ top: 20, right: 30, left: -20, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--primary-color)" />
                                            <stop offset="100%" stopColor="var(--primary-light)" />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey="email"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                                        dy={10}
                                        tickFormatter={(val) => val.split('@')[0]}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                        contentStyle={{
                                            background: 'var(--surface-color)',
                                            borderColor: 'var(--border-color)',
                                            borderRadius: '12px',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                            border: '1px solid var(--border-highlight)'
                                        }}
                                        labelStyle={{ color: 'var(--primary-color)', fontWeight: 600, marginBottom: '4px' }}
                                        itemStyle={{ color: 'var(--text-color)', fontSize: '13px' }}
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill="url(#barGradient)"
                                        radius={[6, 6, 0, 0]}
                                        barSize={40}
                                        animationDuration={1500}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
