import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Signup from './Signup';
import Dashboard from './Dashboard';
import ForgotPassword from './ForgotPassword';
import AcceptInvite from './AcceptInvite';

// Admin Pages
import AdminDashboard from './AdminDashboard';
import AdminAnalytics from './AdminAnalytics';
import UserManagement from './UserManagement';
import Settings from './Settings';

// User Pages
import UserHistory from './UserHistory';
import UserNotifications from './UserNotifications';
import AdminRequests from './AdminRequests';

import './index.css';

const ProtectedRoute = ({ children, role }) => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('role');

  if (!token) return <Navigate to="/login" replace />;
  if (role && userRole !== role) {
    return <Navigate to={userRole === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/invite" element={<AcceptInvite />} />

        {/* User Routes */}
        <Route
          path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />
        <Route
          path="/history"
          element={<ProtectedRoute><UserHistory /></ProtectedRoute>}
        />
        <Route
          path="/profile"
          element={<ProtectedRoute><Settings /></ProtectedRoute>}
        />
        <Route
          path="/notifications"
          element={<ProtectedRoute><UserNotifications /></ProtectedRoute>}
        />

        {/* Admin Routes */}
        <Route
          path="/admin/dashboard"
          element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>}
        />
        <Route
          path="/admin/analytics"
          element={<ProtectedRoute role="admin"><AdminAnalytics /></ProtectedRoute>}
        />
        <Route
          path="/admin/users"
          element={<ProtectedRoute role="admin"><UserManagement /></ProtectedRoute>}
        />
        <Route
          path="/admin/requests"
          element={<ProtectedRoute role="admin"><AdminRequests /></ProtectedRoute>}
        />
        <Route
          path="/admin/settings"
          element={<ProtectedRoute role="admin"><Settings /></ProtectedRoute>}
        />

        {/* Default Redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
