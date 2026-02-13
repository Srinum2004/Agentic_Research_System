import { useState, useEffect } from 'react';
import api from './api';
import Sidebar from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    UserPlus,
    MoreVertical,
    Trash2,
    UserX,
    UserCheck,
    Mail,
    Shield,
    Zap,
    X
} from 'lucide-react';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState(null);

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('user');
    const [limit, setLimit] = useState(10);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/admin/users');
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (user) => {
        try {
            await api.patch(`/admin/users/${user.id}/status`, { is_active: !user.is_active });
            fetchUsers();
        } catch (err) { alert('Action failed'); }
    };

    const deleteUser = async (id) => {
        if (!window.confirm('Delete this user account permanently?')) return;
        try {
            await api.delete(`/admin/users/${id}`);
            setUsers(users.filter(u => u.id !== id));
        } catch (err) { alert('Deletion failed'); }
    };

    const handleOpenCreate = () => {
        setEditUser(null);
        setEmail('');
        setPassword('');
        setRole('user');
        setLimit(10);
        setShowModal(true);
    };

    const handleOpenEdit = (user) => {
        setEditUser(user);
        setEmail(user.email);
        setRole(user.role);
        setLimit(user.search_limit);
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editUser) {
                await api.patch(`/admin/users/${editUser.id}/limit`, { role, search_limit: parseInt(limit) });
            } else {
                await api.post('/admin/users', { email, password, role, search_limit: parseInt(limit) });
            }
            setShowModal(false);
            fetchUsers();
        } catch (err) { alert(err.response?.data?.detail || 'Operation failed'); }
    };

    const filteredUsers = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="layout">
            <Sidebar role="admin" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="hero-title">User Management</h1>
                        <p className="text-muted">Manage system users and their search limits</p>
                    </div>
                    <button className="btn btn-primary" onClick={handleOpenCreate}>
                        <UserPlus size={18} />
                        Add New User
                    </button>
                </header>

                <div className="card" style={{ padding: '0.5rem' }}>
                    <div className="input-with-icon" style={{ background: 'transparent', border: 'none' }}>
                        <Search className="text-dim" size={20} />
                        <input
                            placeholder="Search users by email..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="card">
                    <table className="user-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: '2.5rem' }}>Researcher</th>
                                <th>Role</th>
                                <th>Account Status</th>
                                <th>Verification</th>
                                <th>Usage Quota</th>
                                <th style={{ paddingRight: '2.5rem' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user, idx) => (
                                <motion.tr
                                    key={user.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                                                {user.email.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{user.email}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${user.role}`}>{user.role}</span>
                                    </td>
                                    <td>
                                        <div className={`status-pill ${user.is_active ? 'active' : 'inactive'}`}>
                                            {user.is_active ? 'Active' : 'Disabled'}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${user.is_verified ? 'success' : 'warning'}`} style={{ fontSize: '0.7rem' }}>
                                            {user.is_verified ? 'VERIFIED' : 'PENDING'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div className="usage-meter-progress" style={{ width: 60, height: 4, margin: 0 }}>
                                                <div className="usage-meter-bar" style={{ width: `${(user.search_used / user.search_limit) * 100}%` }} />
                                            </div>
                                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>{user.search_used}/{user.search_limit}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button onClick={() => handleOpenEdit(user)} title="Edit User">
                                                <Shield size={16} />
                                            </button>
                                            <button onClick={() => toggleStatus(user)} title={user.is_active ? 'Deactivate' : 'Activate'}>
                                                {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                                            </button>
                                            <button className="delete" onClick={() => deleteUser(user.id)} title="Terminate">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <AnimatePresence>
                    {showModal && (
                        <div className="modal-overlay">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="auth-card modal-content"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                    <h2 style={{ margin: 0 }}>{editUser ? 'Edit User Settings' : 'Create User Account'}</h2>
                                    <button onClick={() => setShowModal(false)} className="btn-text"><X /></button>
                                </div>
                                <form onSubmit={handleSubmit}>
                                    <div className="input-group">
                                        <label className="input-label">Email Address</label>
                                        <div className="input-with-icon">
                                            <Mail size={18} className="text-muted" />
                                            <input value={email} onChange={e => setEmail(e.target.value)} required disabled={!!editUser} />
                                        </div>
                                    </div>
                                    {!editUser && (
                                        <div className="input-group">
                                            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                                                An invitation will be sent to this email. The user will set their own password to activate the account.
                                            </p>
                                        </div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="input-group">
                                            <label className="input-label">Role</label>
                                            <select value={role} onChange={e => setRole(e.target.value)}>
                                                <option value="user">Standard User</option>
                                                <option value="admin">Administrator</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Search Limit</label>
                                            <input type="number" value={limit} onChange={e => setLimit(e.target.value)} />
                                        </div>
                                    </div>
                                    <button className="btn btn-primary" style={{ width: '100%', marginTop: '2rem' }}>
                                        {editUser ? 'Save Changes' : 'Send Invitation'}
                                    </button>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
