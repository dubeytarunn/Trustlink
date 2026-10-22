import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { DigiLockerModal } from '../components/DigiLockerModal';
import { FaceComparisonModal } from '../components/FaceComparisonModal';
import { Layers, ShieldCheck, CheckCircle2, Camera } from 'lucide-react';

interface Credential {
  id: number;
  credential_id: string;
  template_name: string;
  credential_type: string;
  status: 'active' | 'valid' | 'suspended' | 'revoked' | 'expired';
  issued_at: string;
  expires_at: string | null;
  university_name: string;
  logo_url: string;
  claims: Record<string, unknown>;
  employerVisibleClaims: string[];
}

interface Share {
  id: number;
  share_token: string;
  credential_id: string;
  disclosed_claims_json: string;
  expires_at: string;
  view_count: number;
  revoked_at: string | null;
}

interface CredentialRequest {
  id: number;
  request_id: string;
  employer_name: string;
  purpose: string;
  requested_claims: string[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  expires_at: string | null;
  share_token?: string;
}

export function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'wallet' | 'requests' | 'shares' | 'digilocker'>('wallet');
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [requests, setRequests] = useState<CredentialRequest[]>([]);
  const [pulledDocs, setPulledDocs] = useState<any[]>([]);
  const [isDigiModalOpen, setIsDigiModalOpen] = useState(false);
  const [bioModalCred, setBioModalCred] = useState<Credential | null>(null);
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Category filter
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Credential Details Modal
  const [detailsCred, setDetailsCred] = useState<Credential | null>(null);
  const [w3cData, setW3cData] = useState<any>(null);
  const [showW3cTab, setShowW3cTab] = useState(false);
  const [loadingW3c, setLoadingW3c] = useState(false);

  // Share Modal
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [disclosedClaims, setDisclosedClaims] = useState<string[]>([]);
  const [shareExpiryOption, setShareExpiryOption] = useState<number>(168); // default 7 days
  const [sharePasscode, setSharePasscode] = useState('');
  const [shareResult, setShareResult] = useState<{ shareUrl: string; expiresAt: string; shareToken?: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  // QR Modal
  const [qrModalData, setQrModalData] = useState<{ title: string; subtitle: string; url: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [credRes, shareRes, reqRes] = await Promise.all([
        api.get<{ credentials: Credential[] }>('/student/credentials'),
        api.get<{ shares: Share[] }>('/student/shares'),
        api.get<{ requests: CredentialRequest[] }>('/credential-requests/student').catch(() => ({ requests: [] })),
      ]);
      setCredentials(credRes.credentials);
      setShares(shareRes.shares);
      setRequests(reqRes.requests || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'student') { navigate('/login'); return; }
    loadData();
  }, [user, navigate, loadData]);

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const openShare = (cred: Credential) => {
    setSelectedCred(cred);
    const claimsObj = cred.claims || {};
    const visible = Array.isArray(cred.employerVisibleClaims) && cred.employerVisibleClaims.length > 0
      ? cred.employerVisibleClaims
      : Object.keys(claimsObj);
    setDisclosedClaims(visible);
    setShareResult(null);
    setShowShareModal(true);
  };

  const createShare = async () => {
    if (!selectedCred) return;
    setSharing(true);
    try {
      const res = await api.post<{ shareUrl: string; expiresAt: string; shareToken: string }>('/student/shares', {
        credentialId: selectedCred.credential_id,
        disclosedClaims,
        expiresInHours: shareExpiryOption,
        passcode: sharePasscode || undefined,
      });
      setShareResult(res);
      loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSharing(false);
    }
  };

  const openCredentialDetails = async (cred: Credential) => {
    setDetailsCred(cred);
    setShowW3cTab(false);
    setW3cData(null);
    setLoadingW3c(true);
    try {
      const res = await api.get<any>(`/credentials/${cred.credential_id}/w3c`);
      setW3cData(res.verifiableCredential || res);
    } catch (e: any) {
      console.warn('W3C fetch failed:', e);
      setW3cData({ error: 'W3C data could not be fetched from registry', details: String(e) });
    } finally {
      setLoadingW3c(false);
    }
  };

  const openQrModal = (title: string, subtitle: string, url: string) => {
    setQrModalData({ title, subtitle, url });
  };

  const handleRespondRequest = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      const res = await api.post<{ message: string; shareUrl?: string }>(`/credential-requests/${requestId}/respond`, {
        action,
        expiresInHours: 168,
      });
      showMsg(res.message);
      loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const revokeShare = async (token: string) => {
    if (!confirm('Revoke this share link? Employers will no longer be able to verify with it.')) return;
    try {
      await api.delete(`/student/shares/${token}`);
      showMsg('Share link revoked');
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const filteredCredentials = credentials.filter((c) => {
    if (typeFilter === 'all') return true;
    return c.credential_type.toLowerCase() === typeFilter.toLowerCase();
  });

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'active' || s === 'valid') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">✓ VALID</span>;
    }
    if (s === 'suspended') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">⚠ SUSPENDED</span>;
    }
    if (s === 'revoked') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800">✕ REVOKED</span>;
    }
    if (s === 'expired') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">EXPIRED</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">{status}</span>;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070F20]">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070F20]">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">TL</span>
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 dark:text-white">TrustLink</h1>
            <p className="text-xs text-slate-500">Student Digital Wallet</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">{user?.email}</span>
          <button
            id="student-logout"
            onClick={() => logout().then(() => navigate('/login'))}
            className="text-sm text-red-500 hover:text-red-700 font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 font-bold">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700 text-sm flex justify-between items-center">
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="text-emerald-500 font-bold">✕</button>
          </div>
        )}

        {/* Wallet Hero Banner */}
        <div className="p-6 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-3xl shadow-lg border border-indigo-700/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Decentralized Identity Active
            </div>
            <h2 className="text-2xl font-black tracking-tight">My TrustLink Wallet</h2>
            <p className="text-xs text-indigo-200 mt-1 max-w-lg">
              Self-sovereign verifiable credentials secured with ECDSA P-256 signatures and zero-knowledge Pedersen commitments.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button
                onClick={() => setIsDigiModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-blue-900/30 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Import from DigiLocker / NAD
              </button>
              <button
                onClick={() => navigate('/kyc/aadhaar')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-900/30 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Aadhaar e-KYC Identity
              </button>
              <button
                onClick={() => {
                  setBioModalCred(credentials[0] || null);
                  setIsBioModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-indigo-900/30 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Live Camera Face Match
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-indigo-700/50 pt-3 sm:pt-0 sm:pl-6 text-center">
            <div>
              <div className="text-2xl font-bold">{credentials.length}</div>
              <div className="text-[11px] text-indigo-300 uppercase">Credentials</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{shares.filter(s => !s.revoked_at).length}</div>
              <div className="text-[11px] text-indigo-300 uppercase">Active Shares</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">{requests.filter(r => r.status === 'pending').length}</div>
              <div className="text-[11px] text-indigo-300 uppercase">Requests</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('wallet')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'wallet'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Digital Credentials ({credentials.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'requests'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Employer Requests
            {requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('shares')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'shares'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sharing Activity ({shares.length})
          </button>
          <button
            onClick={() => setActiveTab('digilocker')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'digilocker'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 text-blue-500" />
            DigiLocker / NAD Records ({pulledDocs.length})
          </button>
        </div>

        {/* TAB 1: Digital Wallet Credentials */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              {['all', 'degree', 'skill', 'transcript', 'certificate', 'micro-credential'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setTypeFilter(cat)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium transition ${
                    typeFilter === cat
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {filteredCredentials.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <div className="text-4xl mb-3">🎓</div>
                <p className="text-slate-500 dark:text-slate-400">No credentials found for this category.</p>
                <p className="text-sm text-slate-400 mt-1">Credentials issued by accredited universities will appear here.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredCredentials.map((cred) => {
                  const isEligibleToShare = cred.status === 'active' || cred.status === 'valid';
                  return (
                    <div
                      key={cred.id}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {cred.logo_url ? (
                              <img src={cred.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 font-bold">
                                🎓
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-sm">{cred.template_name || cred.credential_type}</p>
                              <p className="text-xs text-slate-500">{cred.university_name}</p>
                            </div>
                          </div>
                          {getStatusBadge(cred.status)}
                        </div>

                        {/* Credential summary info */}
                        <div className="space-y-1 mb-4 text-xs">
                          <p className="text-slate-500">
                            Issued: <span className="text-slate-700 dark:text-slate-300">{new Date(cred.issued_at).toLocaleDateString()}</span>
                          </p>
                          {cred.expires_at && (
                            <p className="text-slate-500">
                              Expires: <span className="text-slate-700 dark:text-slate-300">{new Date(cred.expires_at).toLocaleDateString()}</span>
                            </p>
                          )}
                          <p className="text-slate-500 font-mono truncate">
                            ID: {cred.credential_id}
                          </p>
                          <div className="pt-1 flex flex-wrap gap-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                              {cred.credential_type}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                              W3C Compatible
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <button
                          onClick={() => openCredentialDetails(cred)}
                          className="flex-1 py-2 px-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition"
                        >
                          View Credential
                        </button>

                        {isEligibleToShare ? (
                          <button
                            id={`share-cred-${cred.id}`}
                            onClick={() => openShare(cred)}
                            className="flex-1 py-2 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
                          >
                            Share
                          </button>
                        ) : (
                          <button
                            disabled
                            className="flex-1 py-2 px-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-semibold rounded-lg cursor-not-allowed"
                            title="Cannot share suspended or revoked credential"
                          >
                            Sharing Locked
                          </button>
                        )}

                        <button
                          onClick={() => openQrModal(
                            cred.template_name || 'Academic Credential',
                            `${cred.university_name} • ${cred.credential_id}`,
                            `${window.location.origin}/verify/credential/${cred.credential_id}`
                          )}
                          className="py-2 px-2.5 border border-slate-200 dark:border-slate-600 hover:border-indigo-500 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition flex items-center gap-1"
                        >
                          <span>QR</span>
                        </button>

                        <button
                          onClick={() => {
                            setBioModalCred(cred);
                            setIsBioModalOpen(true);
                          }}
                          title="Compare live camera photo against this credential record"
                          className="py-2 px-2.5 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Face Match</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Employer Requests */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200">
              <span className="font-bold">Selective Disclosure Requests: </span>
              Employers request specific verified claims without requiring full credential exposure. You have complete control to approve or decline.
            </div>

            {requests.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">No pending credential requests</p>
                <p className="text-xs text-slate-400 mt-1">When prospective employers request verification claims, they will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-base">{req.employer_name}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                          req.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : req.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Purpose: <span className="text-slate-700 dark:text-slate-300">{req.purpose}</span></p>

                      {/* Claims requested breakdown */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
                        <div className="font-semibold text-slate-700 dark:text-slate-300">Employer Request Breakdown:</div>
                        <div className="flex flex-wrap gap-2">
                          {req.requested_claims.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">
                              ✓ {c}
                            </span>
                          ))}
                          <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                            GPA: Not requested
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleRespondRequest(req.request_id, 'approve')}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                          >
                            Approve &amp; Share
                          </button>
                          <button
                            onClick={() => handleRespondRequest(req.request_id, 'reject')}
                            className="px-4 py-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {req.status === 'approved' && req.share_token && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/verify/share/${req.share_token}`)}
                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-semibold"
                          >
                            Copy Share Link
                          </button>
                          <button
                            onClick={() => openQrModal(
                              `Verifiable Presentation: ${req.employer_name}`,
                              `Selective disclosure presentation for ${req.employer_name}`,
                              `${window.location.origin}/verify/share/${req.share_token}`
                            )}
                            className="px-3 py-1.5 border rounded-lg text-xs font-semibold"
                          >
                            QR
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Sharing Activity */}
        {activeTab === 'shares' && (
          <div className="space-y-4">
            {shares.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                <p className="text-slate-500 dark:text-slate-400 text-sm">No share links generated yet.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                {shares.map((sh) => {
                  const isExpired = new Date(sh.expires_at) < new Date();
                  const isRevoked = Boolean(sh.revoked_at);
                  return (
                    <div key={sh.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate">
                            {sh.share_token}
                          </code>
                          {isRevoked ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-red-100 text-red-700">Revoked</span>
                          ) : isExpired ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-700">Expired</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-700">Active</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          Target: {sh.credential_id}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span>Expires: {new Date(sh.expires_at).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{sh.view_count} views</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/verify/share/${sh.share_token}`)}
                          className="text-xs py-1.5 px-3 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 transition"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => openQrModal(
                            'Shared Verifiable Presentation',
                            `Token: ${sh.share_token}`,
                            `${window.location.origin}/verify/share/${sh.share_token}`
                          )}
                          className="text-xs py-1.5 px-3 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-semibold"
                        >
                          QR
                        </button>
                        {!isRevoked && (
                          <button
                            onClick={() => revokeShare(sh.share_token)}
                            className="text-xs py-1.5 px-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded font-semibold hover:bg-red-100 transition"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DigiLocker / NAD Records */}
        {activeTab === 'digilocker' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  National Academic Depository (DigiLocker / NAD) Verified Records
                </h3>
                <p className="text-xs text-blue-700/80 dark:text-blue-400 mt-0.5">
                  Direct government-repository authenticated marksheets and degrees issued by registered Indian universities.
                </p>
              </div>
              <button
                onClick={() => setIsDigiModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Query & Pull NAD Record
              </button>
            </div>

            {pulledDocs.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  No DigiLocker Documents Imported Yet
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Pull your 10th/12th marksheets, diploma, or degree certificates directly from the National Academic Depository into your cryptographic TrustLink wallet.
                </p>
                <button
                  onClick={() => setIsDigiModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer"
                >
                  Import Academic Record
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {pulledDocs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 dark:border-blue-900 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-bold">
                        {doc.docType || doc.doc_type || 'ACADEMIC RECORD'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                        VERIFIED_NAD
                      </span>
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {doc.candidateName || doc.candidate_name || 'Academic Record'}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Roll: {doc.rollNumber || doc.roll_number} &bull; Year: {doc.passingYear || doc.passing_year}
                      </p>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      URI: {doc.uri}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Modal 1: Credential Details Modal ────────────────────────────── */}
      {detailsCred && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 font-bold text-lg">
                  🎓
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {detailsCred.template_name || detailsCred.credential_type}
                  </h3>
                  <p className="text-xs text-slate-500">{detailsCred.university_name}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailsCred(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Toggle between standard view and W3C VC JSON view */}
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setShowW3cTab(false)}
                className={`flex-1 py-1.5 rounded-lg transition ${!showW3cTab ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Academic Record
              </button>
              <button
                onClick={() => setShowW3cTab(true)}
                className={`flex-1 py-1.5 rounded-lg transition ${showW3cTab ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                W3C Verifiable Credential (JSON-LD)
              </button>
            </div>

            {!showW3cTab ? (
              <div className="space-y-4">
                {/* Status and metadata */}
                <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-500">Lifecycle Status:</span>
                    <div className="mt-1">{getStatusBadge(detailsCred.status)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Issued On:</span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                      {new Date(detailsCred.issued_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Credential ID:</span>
                    <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-1 break-all">
                      {detailsCred.credential_id}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Type:</span>
                    <div className="font-semibold uppercase text-slate-800 dark:text-slate-200 mt-1">
                      {detailsCred.credential_type}
                    </div>
                  </div>
                </div>

                {/* Claims list */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Official Academic Record Attributes
                  </h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl overflow-hidden text-xs">
                    {Object.entries(detailsCred.claims || {}).map(([k, v]) => (
                      <div key={k} className="p-3 flex items-center justify-between">
                        <span className="font-semibold text-slate-600 dark:text-slate-400 capitalize">
                          {k.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{String(v ?? '')}</span>
                      </div>
                    ))}
                    {Object.keys(detailsCred.claims || {}).length === 0 && (
                      <div className="p-4 text-center text-slate-400 italic">No specific claims recorded.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>W3C VC 1.1 / 2.0 Compliant Data Model:</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(w3cData, null, 2))}
                    className="text-indigo-600 hover:underline font-semibold"
                  >
                    Copy JSON
                  </button>
                </div>
                {loadingW3c ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading W3C representation…</div>
                ) : (
                  <pre className="p-4 rounded-2xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
                    {JSON.stringify(w3cData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={`/api/credentials/${encodeURIComponent(detailsCred.credential_id)}/certificate.pdf`}
                target="_blank"
                rel="noreferrer"
                download={`TrustLink-Certificate-${detailsCred.credential_id}.pdf`}
                className="px-4 py-2.5 text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm"
              >
                <span>📜</span> Download PDF Certificate
              </a>
              <a
                href={`/verify/credential/${detailsCred.credential_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition min-w-[200px]"
              >
                Verify on Public Ledger ↗
              </a>
              <button
                onClick={() => setDetailsCred(null)}
                className="px-5 py-2.5 border rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: QR Code Modal ────────────────────────────────────────── */}
      {qrModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center space-y-5">
            <div className="flex justify-between items-start">
              <div className="text-left">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">{qrModalData.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{qrModalData.subtitle}</p>
              </div>
              <button onClick={() => setQrModalData(null)} className="text-slate-400 font-bold">✕</button>
            </div>

            {/* QR Code fetched dynamically from backend endpoint */}
            <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-indigo-200 inline-block shadow-inner">
              <img
                src={`/api/verify/qr?text=${encodeURIComponent(qrModalData.url)}&format=image`}
                alt="QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>

            <p className="text-xs text-slate-500">
              Scan with mobile phone camera to verify instantly on TrustLink Portal.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(qrModalData.url);
                  showMsg('Verification URL copied!');
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
              >
                Copy URL
              </button>
              <button
                onClick={() => setQrModalData(null)}
                className="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Selective Disclosure Share Modal ──────────────────────── */}
      {showShareModal && selectedCred && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Verifiable Presentation</h3>
                <p className="text-xs text-slate-500">Zero-Knowledge Selective Disclosure Presentation</p>
              </div>
              <button
                onClick={() => { setShowShareModal(false); setShareResult(null); }}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >✕</button>
            </div>

            {!shareResult ? (
              <div className="space-y-4">
                {/* Claim selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Select Information to Share
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/30">
                    {Object.keys(selectedCred.claims).map((claimName) => (
                      <label key={claimName} className="flex items-center gap-2.5 cursor-pointer p-1.5 hover:bg-white dark:hover:bg-slate-700/50 rounded-lg transition">
                        <input
                          type="checkbox"
                          checked={disclosedClaims.includes(claimName)}
                          onChange={(e) => {
                            if (e.target.checked) setDisclosedClaims((prev) => [...prev, claimName]);
                            else setDisclosedClaims((prev) => prev.filter((c) => c !== claimName));
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">
                          {claimName.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <span className="text-xs font-mono text-slate-400 ml-auto">{String(selectedCred.claims[claimName])}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Unchecked claims remain cryptographically blinded via Pedersen commitments. Employers see "Not Disclosed".
                  </p>
                </div>

                {/* Expiry Selector (Feature 8) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Share Link Expiration
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '24 Hours', hours: 24 },
                      { label: '7 Days', hours: 168 },
                      { label: '30 Days', hours: 720 },
                      { label: 'Never', hours: 0 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setShareExpiryOption(opt.hours)}
                        className={`py-2 px-1 text-xs font-semibold rounded-xl border text-center transition ${
                          shareExpiryOption === opt.hours
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional passcode */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Access Passcode (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank for public share"
                    value={sharePasscode}
                    onChange={(e) => setSharePasscode(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  id="create-share-btn"
                  onClick={createShare}
                  disabled={sharing || disclosedClaims.length === 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-md"
                >
                  {sharing ? 'Generating Cryptographic Presentation…' : 'Create Verifiable Presentation'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    <span>✓</span> Presentation Ready &amp; Signed
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 break-all font-mono">
                    {shareResult.shareUrl}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Expires: {new Date(shareResult.expiresAt).toLocaleString()}
                  </p>
                </div>

                {/* QR code */}
                <div className="p-3 bg-white rounded-2xl border inline-block shadow-sm">
                  <img
                    src={`/api/verify/qr?text=${encodeURIComponent(shareResult.shareUrl)}&format=image`}
                    alt="Presentation QR Code"
                    className="w-40 h-40 mx-auto"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareResult.shareUrl);
                      showMsg('Link copied to clipboard!');
                    }}
                    className="flex-1 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => { setShowShareModal(false); setShareResult(null); }}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── DigiLocker / NAD Modal ─── */}
      <DigiLockerModal
        isOpen={isDigiModalOpen}
        onClose={() => setIsDigiModalOpen(false)}
        credentialId={credentials[0]?.credential_id || 'TL-G807-HDAB-BZ7R-8'}
        onDocumentPulled={(doc) => {
          setPulledDocs((prev) => [doc, ...prev]);
          showMsg('Official academic record successfully pulled and verified from National Academic Depository!');
        }}
      />

      {/* ─── AI Live Camera Face Comparison Modal ─── */}
      <FaceComparisonModal
        isOpen={isBioModalOpen}
        onClose={() => {
          setIsBioModalOpen(false);
          setBioModalCred(null);
        }}
        referencePhotoUrl={
          bioModalCred?.logo_url ||
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80'
        }
        candidateName={
          (bioModalCred?.claims?.studentName as string) ||
          (user?.email ? user.email.split('@')[0] : 'Student')
        }
        credentialId={bioModalCred?.credential_id}
        onMatchComplete={(bioRes) => {
          showMsg(
            `Live face comparison complete: ${bioRes.verdict} (${bioRes.similarityScore}% similarity score)`
          );
        }}
      />
    </div>
  );
}
