import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Login } from './pages/Login';
import { ClaimAccount } from './pages/ClaimAccount';
import { Universities } from './pages/admin/Universities';
import { AuditLog } from './pages/admin/AuditLog';
import { TamperLab } from './pages/admin/TamperLab';
import { UniversityDashboard } from './pages/university/UniversityDashboard';
import { StudentDashboard } from './pages/StudentDashboard';
import { VerifyCredential } from './pages/VerifyCredential';
import { VerifyShare } from './pages/VerifyShare';
import { Landing } from './pages/Landing';
import { AadhaarKYC } from './pages/AadhaarKYC';
import { EmployerDashboard } from './pages/employer/EmployerDashboard';

import { ErrorBoundary } from './components/ErrorBoundary';

/** Guard that redirects unauthenticated users to /login */
function RequireRole({ role, children }: { role: string; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent" /></div>;
  if (!user || user.role !== role) return <Navigate to="/login" replace />;
  return <ErrorBoundary fallbackTitle={`Protected ${role.toUpperCase()} Workspace Error`}>{children}</ErrorBoundary>;
}

/** Auto-redirect from /dashboard based on user role */
function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/universities" replace />;
  if (user.role === 'university') return <Navigate to="/university" replace />;
  if (user.role === 'student') return <Navigate to="/student" replace />;
  if (user.role === 'employer') return <Navigate to="/employer" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary fallbackTitle="Application Navigation Error">
            <Routes>
            {/* Public Landing & Verification */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/claim" element={<ClaimAccount />} />
            <Route path="/kyc/aadhaar" element={<AadhaarKYC />} />
            <Route path="/verify/credential/:credentialId" element={<VerifyCredential />} />
            <Route path="/verify/share/:shareToken" element={<VerifyShare />} />

            {/* Admin */}
            <Route path="/admin/universities" element={<RequireRole role="admin"><Universities /></RequireRole>} />
            <Route path="/admin/audit" element={<RequireRole role="admin"><AuditLog /></RequireRole>} />
            <Route path="/admin/tamper" element={<RequireRole role="admin"><TamperLab /></RequireRole>} />

            {/* University */}
            <Route path="/university" element={<RequireRole role="university"><UniversityDashboard /></RequireRole>} />
            <Route path="/university/*" element={<RequireRole role="university"><UniversityDashboard /></RequireRole>} />

            {/* Student */}
            <Route path="/student" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
            <Route path="/student/*" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />

            {/* Employer */}
            <Route path="/employer" element={<RequireRole role="employer"><EmployerDashboard /></RequireRole>} />
            <Route path="/employer/verify" element={<RequireRole role="employer"><EmployerDashboard /></RequireRole>} />
            <Route path="/employer/history" element={<RequireRole role="employer"><EmployerDashboard /></RequireRole>} />

            {/* Default redirects */}
            <Route path="/dashboard" element={<DashboardRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
