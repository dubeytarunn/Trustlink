import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import {
  ShieldCheck,
  Search,
  Key,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Building,
  Lock,
  Code,
  Scan,
  Send,
  EyeOff,
  Layers,
  Users,
} from 'lucide-react';
import { FaceComparisonModal } from '../../components/FaceComparisonModal';
import { DigiLockerModal } from '../../components/DigiLockerModal';
import { VerifyDocument } from './VerifyDocument';
import { BatchVerification } from './BatchVerification';
import { ErrorBoundary } from '../../components/ErrorBoundary';

interface EmployerProfile {
  id: number;
  companyName: string;
  emailDomain: string;
  officialEmail: string;
  website: string | null;
  status: string;
}

interface VerificationStats {
  total: number;
  valid: number;
  failed: number;
}

interface VerificationLog {
  id: number;
  seq: number;
  credentialId: string;
  method: string;
  outcome: string;
  createdAt: string;
  universityName: string;
}

interface ApiKeyItem {
  id: number;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface TrustRegistryInfo {
  registered: boolean;
  authorizedIssuer: boolean;
  institutionName: string;
  status: string;
}

interface VerificationChecks {
  credentialIntegrity: boolean;
  universitySignature: boolean;
  issuerAuthorization: boolean;
  credentialStatus: boolean;
  expiration: boolean;
  selectiveDisclosure: boolean;
  presentationValidity: boolean;
}

interface VerificationResult {
  outcome: string;
  isValid: boolean;
  credentialId?: string;
  universityName?: string;
  logoUrl?: string;
  disclosedClaims?: any;
  undisclosedClaims?: string[];
  failureReason?: string;
  requiresPasscode?: boolean;
  status?: string;
  trustRegistry?: TrustRegistryInfo;
  checks?: VerificationChecks;
  w3c?: any;
}

interface SentCredentialRequest {
  id: number;
  request_id: string;
  student_email: string;
  purpose: string;
  requested_claims: string[];
  status: 'pending' | 'approved' | 'rejected';
  share_token?: string;
  created_at: string;
}

export function EmployerDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'verify' | 'batch' | 'request' | 'history' | 'api-keys' | 'document'>('verify');
  const [profile, setProfile] = useState<EmployerProfile | null>(null);
  const [stats, setStats] = useState<VerificationStats>({ total: 0, valid: 0, failed: 0 });
  const [history, setHistory] = useState<VerificationLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [sentRequests, setSentRequests] = useState<SentCredentialRequest[]>([]);

  // Verification form state
  const [verifyType, setVerifyType] = useState<'credential_id' | 'share_token'>('credential_id');
  const [verifyInput, setVerifyInput] = useState('');
  const [passcode, setPasscode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState('');
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [isDigiModalOpen, setIsDigiModalOpen] = useState(false);
  const [showW3c, setShowW3c] = useState(false);

  // Request form state (Feature 7)
  const [requestForm, setRequestForm] = useState({
    studentEmail: 'student@university.edu',
    purpose: 'Senior Software Engineer Verification',
    claims: ['degree', 'graduationYear'],
  });
  const [requesting, setRequesting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState('');

  // API Key creation modal state
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<{ apiKey: string; prefix: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadProfileAndData = useCallback(async () => {
    try {
      const res = await api.get<{ employer: EmployerProfile; stats: VerificationStats }>('/employer/profile');
      setProfile(res.employer);
      setStats(res.stats);

      const [histRes, keysRes, reqRes] = await Promise.all([
        api.get<{ verifications: VerificationLog[] }>('/employer/verifications'),
        api.get<{ keys: ApiKeyItem[] }>('/employer/api-keys'),
        api.get<{ requests: SentCredentialRequest[] }>('/employer/credential-requests').catch(() => ({ requests: [] })),
      ]);
      setHistory(histRes.verifications);
      setApiKeys(keysRes.keys);
      setSentRequests(reqRes.requests || []);
    } catch (err: any) {
      console.error('Failed to load employer data:', err);
    }
  }, []);

  useEffect(() => {
    loadProfileAndData();
  }, [loadProfileAndData]);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!verifyInput.trim()) return;

    setVerifying(true);
    setVerifyResult(null);
    setVerifyError('');

    try {
      // If user pasted a full URL, parse the token/id
      let cleanQuery = verifyInput.trim();
      if (cleanQuery.includes('/verify/share/')) {
        cleanQuery = cleanQuery.split('/verify/share/')[1].split('?')[0];
        setVerifyType('share_token');
      } else if (cleanQuery.includes('/verify/credential/')) {
        cleanQuery = cleanQuery.split('/verify/credential/')[1].split('?')[0];
        setVerifyType('credential_id');
      }

      const res = await api.post<VerificationResult>('/employer/verify', {
        type: verifyType,
        query: cleanQuery,
        passcode: passcode.trim() || undefined,
      });

      setVerifyResult(res);
      // Reload stats and history
      const [histRes, profRes] = await Promise.all([
        api.get<{ verifications: VerificationLog[] }>('/employer/verifications'),
        api.get<{ employer: EmployerProfile; stats: VerificationStats }>('/employer/profile'),
      ]);
      setHistory(histRes.verifications);
      setStats(profRes.stats);
    } catch (err: any) {
      setVerifyError(err.message || 'Verification request failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequesting(true);
    setRequestSuccess('');
    try {
      const res = await api.post<{ message: string; request: SentCredentialRequest }>('/employer/credential-requests', {
        studentEmail: requestForm.studentEmail,
        purpose: requestForm.purpose,
        requestedClaims: requestForm.claims,
      });
      setRequestSuccess(`Request sent! ID: ${res.request?.request_id || 'REQ-SUCCESS'}`);
      const reqRes = await api.get<{ requests: SentCredentialRequest[] }>('/employer/credential-requests');
      setSentRequests(reqRes.requests || []);
    } catch (err: any) {
      alert(err.message || 'Failed to submit request');
    } finally {
      setRequesting(false);
    }
  };

  const handleGenerateKey = async () => {
    try {
      setGeneratingKey(true);
      const res = await api.post<{ apiKey: string; prefix: string }>('/employer/api-keys', {});
      setNewKeyResult(res);
      const keysRes = await api.get<{ keys: ApiKeyItem[] }>('/employer/api-keys');
      setApiKeys(keysRes.keys);
    } catch (err: any) {
      alert(err.message || 'Failed to generate API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    if (!confirm('Are you sure you want to revoke this API key? Any ATS integrations using this key will stop working.')) return;
    try {
      await api.delete(`/employer/api-keys/${keyId}`);
      const keysRes = await api.get<{ keys: ApiKeyItem[] }>('/employer/api-keys');
      setApiKeys(keysRes.keys);
    } catch (err: any) {
      alert(err.message || 'Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Outcome banner computation
  const renderOutcomeBanner = (res: VerificationResult) => {
    const outcome = (res.outcome || '').toLowerCase();
    if (outcome === 'revoked') {
      return (
        <div className="p-4 rounded-xl border bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-3">
          <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-extrabold text-base tracking-wider text-rose-700 dark:text-rose-300">
              ✕ CREDENTIAL REVOKED
            </div>
            <p className="text-xs mt-1">
              This credential was officially invalidated by the issuing institution and is NO LONGER VALID.
            </p>
          </div>
        </div>
      );
    }
    if (outcome === 'suspended') {
      return (
        <div className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-extrabold text-base tracking-wider text-amber-700 dark:text-amber-300">
              ⚠ CREDENTIAL SUSPENDED
            </div>
            <p className="text-xs mt-1">
              This credential is under temporary administrative hold and cannot be verified as valid.
            </p>
          </div>
        </div>
      );
    }
    if (outcome === 'expired') {
      return (
        <div className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-extrabold text-base tracking-wider text-amber-700 dark:text-amber-300">
              ⚠ PRESENTATION EXPIRED
            </div>
            <p className="text-xs mt-1">
              This shared credential presentation is no longer valid. The candidate must issue a fresh share token.
            </p>
          </div>
        </div>
      );
    }
    if (res.isValid) {
      return (
        <div className="p-4 rounded-xl border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-extrabold text-base tracking-wider text-emerald-700 dark:text-emerald-300">
              ✓ CREDENTIAL VERIFIED
            </div>
            <p className="text-xs mt-1">
              Cryptographically authenticated against issuing university ECDSA P-256 public key. Zero-tamper verified.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="p-4 rounded-xl border bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-3">
        <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-extrabold text-base tracking-wider text-rose-700 dark:text-rose-300">
            ✕ VERIFICATION FAILED: {outcome.toUpperCase()}
          </div>
          <p className="text-xs mt-1">
            {res.failureReason || 'Cryptographic verification check failed.'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header Profile Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Building className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {profile?.companyName || 'Acme Global Corporation'}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  Verified Employer
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {user?.email} &bull; Domain: {profile?.emailDomain || 'acme-corp.demo'}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
            <div className="text-center">
              <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Verifications</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.valid}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Authentic</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{stats.failed}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Issues</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('verify')}
            className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'verify'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Verification Portal
          </button>
          <button
            onClick={() => setActiveTab('request')}
            className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'request'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Send className="w-4 h-4" />
            Request Credentials ({sentRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            Verification History ({history.length})
          </button>
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'api-keys'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" />
            ATS API Keys ({apiKeys.filter((k) => !k.revoked_at).length})
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'batch'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            ATS Batch Verify
          </button>
          <button
            onClick={() => setActiveTab('document')}
            className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'document'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Document Intelligence
          </button>

          <button
            onClick={() => setIsDigiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 my-auto ml-auto rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold text-xs border border-blue-200 dark:border-blue-800 transition shadow-sm cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            DigiLocker / NAD Pull
          </button>
        </div>

        {/* TAB: ATS Batch Verify */}
        {activeTab === 'batch' && (
          <BatchVerification />
        )}

        {/* TAB 5: Document Intelligence */}
        {activeTab === 'document' && (
          <VerifyDocument />
        )}

        {/* TAB 1: Verification Portal */}
        {activeTab === 'verify' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                  Academic Credential Verification Portal
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Cryptographically verify academic credentials and selective disclosure presentations.
                </p>

                {/* Input Method Toggle */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyType('credential_id');
                      setVerifyResult(null);
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                      verifyType === 'credential_id'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    By Credential ID
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyType('share_token');
                      setVerifyResult(null);
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                      verifyType === 'share_token'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    By Share Link / QR Token
                  </button>
                </div>

                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                      {verifyType === 'credential_id' ? 'Credential ID (e.g. TL-G807-HDAB-BZ7R-8)' : 'Share Link or QR Token (e.g. demo-share-verified-token)'}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={verifyInput}
                        onChange={(e) => setVerifyInput(e.target.value)}
                        placeholder={
                          verifyType === 'credential_id'
                            ? 'e.g. TL-G807-HDAB-BZ7R-8'
                            : 'e.g. demo-share-verified-token or paste URL'
                        }
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                        required
                      />
                      <Search className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
                    </div>
                  </div>

                  {verifyType === 'share_token' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                        Passcode (if required)
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          value={passcode}
                          onChange={(e) => setPasscode(e.target.value)}
                          placeholder="Optional 4-8 digit passcode"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                        />
                        <Lock className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
                      </div>
                    </div>
                  )}

                  {verifyError && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      {verifyError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={verifying || !verifyInput.trim()}
                    className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-md hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {verifying ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Running Cryptographic Audit...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Verify Credential Now
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Trust Registry Summary Box (Feature 6) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-indigo-500" />
                    TrustLink Trust Registry Status
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    NETWORK ACTIVE
                  </span>
                </div>
                <p className="text-slate-500">
                  All universities are registered as accredited root authorities. Signatures are verified against authoritative public key certificates.
                </p>
              </div>
            </div>

            {/* Verification Result Card */}
            <div className="lg:col-span-6">
              {verifyResult ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
                  {/* Outcome Banner */}
                  {renderOutcomeBanner(verifyResult)}

                  {/* 7-Point Audit Checklist Table (Verification Page Improvement) */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      TRUSTLINK VERIFICATION AUDIT
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        { label: 'Credential Integrity', ok: verifyResult.checks ? verifyResult.checks.credentialIntegrity : verifyResult.isValid },
                        { label: 'University Signature', ok: verifyResult.checks ? verifyResult.checks.universitySignature : verifyResult.isValid },
                        { label: 'Issuer Authorization', ok: verifyResult.checks ? verifyResult.checks.issuerAuthorization : verifyResult.isValid },
                        { label: 'Credential Status', ok: verifyResult.checks ? verifyResult.checks.credentialStatus : verifyResult.isValid },
                        { label: 'Expiration', ok: verifyResult.checks ? verifyResult.checks.expiration : (verifyResult.outcome !== 'expired') },
                        { label: 'Selective Disclosure', ok: verifyResult.checks ? verifyResult.checks.selectiveDisclosure : true },
                        { label: 'Presentation Validity', ok: verifyResult.checks ? verifyResult.checks.presentationValidity : verifyResult.isValid },
                      ].map((item) => (
                        <div key={item.label} className="px-4 py-2 flex items-center justify-between">
                          <span className="font-medium text-slate-600 dark:text-slate-400">{item.label}</span>
                          <span className={`font-bold flex items-center gap-1 ${item.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {item.ok ? '✓ VALID' : '✕ FAIL'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* University & Trust Registry Info (Feature 6) */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Issuer Institution:</span>
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                        {verifyResult.universityName || 'VIT Chennai'}
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Issuer Authorization:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        VALID ✓ (Accredited Issuer)
                      </span>
                    </div>
                    {verifyResult.credentialId && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500">Credential ID:</span>
                        <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {verifyResult.credentialId}
                        </code>
                      </div>
                    )}
                  </div>

                  {/* Disclosed and Undisclosed Academic Claims (Feature 5) */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Disclosed &amp; Verified Claims
                    </h3>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
                      {verifyResult.disclosedClaims && (
                        Array.isArray(verifyResult.disclosedClaims) ? (
                          verifyResult.disclosedClaims.map((claim: any, idx: number) => (
                            <div key={idx} className="p-3 flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                                {claim.claimName || claim.name || `Attribute ${idx + 1}`}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">
                                {String(claim.value ?? claim.claimValue ?? '')}
                              </span>
                            </div>
                          ))
                        ) : (
                          Object.entries(verifyResult.disclosedClaims).map(([key, val]) => (
                            <div key={key} className="p-3 flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                                {key.replace(/([A-Z])/g, ' $1')}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">
                                {String(val)}
                              </span>
                            </div>
                          ))
                        )
                      )}

                      {/* Render Undisclosed Claims with "Not disclosed" badge */}
                      {verifyResult.undisclosedClaims && verifyResult.undisclosedClaims.map((claimName) => (
                        <div key={claimName} className="p-3 flex items-center justify-between text-xs bg-slate-100/50 dark:bg-slate-800/40">
                          <span className="font-medium text-slate-400 capitalize">
                            {claimName.replace(/([A-Z])/g, ' $1')}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                            <EyeOff className="w-3 h-3" />
                            Not disclosed
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Biometrics Suite Button */}
                  {verifyResult.isValid && (
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBioModalOpen(true)}
                        className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
                      >
                        <Scan className="w-3.5 h-3.5" />
                        AI Biometric Match
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowW3c(!showW3c)}
                        className="py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition"
                      >
                        {showW3c ? 'Hide W3C' : 'W3C VC View'}
                      </button>
                    </div>
                  )}

                  {showW3c && verifyResult.w3c && (
                    <pre className="p-3 bg-slate-950 text-slate-200 text-[10px] font-mono rounded-xl overflow-x-auto max-h-48">
                      {JSON.stringify(verifyResult.w3c, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="h-full min-h-[360px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
                    Awaiting Credential or Presentation
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Enter Credential ID <code className="text-indigo-500">TL-G807-HDAB-BZ7R-8</code> or Share Token <code className="text-indigo-500">demo-share-verified-token</code> to inspect.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Employer Credential Requests (Feature 7) */}
        {activeTab === 'request' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Request Candidate Credentials
              </h2>
              <p className="text-xs text-slate-500">
                Request specific verified claims from a student. Students approve or reject with their own consent.
              </p>

              {requestSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                  {requestSuccess}
                </div>
              )}

              <form onSubmit={handleCreateRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Candidate / Student Email
                  </label>
                  <input
                    type="email"
                    required
                    value={requestForm.studentEmail}
                    onChange={(e) => setRequestForm({ ...requestForm, studentEmail: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Verification Purpose
                  </label>
                  <input
                    type="text"
                    required
                    value={requestForm.purpose}
                    onChange={(e) => setRequestForm({ ...requestForm, purpose: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Required Claims:
                  </label>
                  <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                    {['degree', 'graduationYear', 'gpa', 'major', 'studentNumber'].map((claim) => (
                      <label key={claim} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requestForm.claims.includes(claim)}
                          onChange={(e) => {
                            if (e.target.checked) setRequestForm({ ...requestForm, claims: [...requestForm.claims, claim] });
                            else setRequestForm({ ...requestForm, claims: requestForm.claims.filter(c => c !== claim) });
                          }}
                          className="rounded text-indigo-600"
                        />
                        <span className="capitalize">{claim.replace(/([A-Z])/g, ' $1')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={requesting || requestForm.claims.length === 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-md disabled:opacity-50"
                >
                  {requesting ? 'Sending Request…' : 'Generate & Send Request'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Sent Credential Requests ({sentRequests.length})
              </h2>

              {sentRequests.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No credential requests sent yet.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {sentRequests.map((r) => (
                    <div key={r.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{r.student_email}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                          r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-slate-500">Purpose: {r.purpose}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="font-semibold text-slate-600">Requested:</span>
                        {r.requested_claims.map((c) => (
                          <span key={c} className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded font-mono">
                            {c}
                          </span>
                        ))}
                      </div>

                      {r.status === 'approved' && r.share_token && (
                        <div className="pt-2 flex items-center gap-2 border-t border-slate-200 dark:border-slate-700">
                          <button
                            onClick={() => {
                              setVerifyType('share_token');
                              setVerifyInput(r.share_token!);
                              setActiveTab('verify');
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition"
                          >
                            Inspect Verifiable Presentation ➔
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Verification History */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Employer Verification Audit Trail</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Hash-chained immutable audit log of all verifications performed by your organization.
                </p>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                No verifications recorded yet. Run a verification from the Verification Portal tab.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">Ledger Seq</th>
                      <th className="px-6 py-3.5">Credential ID</th>
                      <th className="px-6 py-3.5">Institution</th>
                      <th className="px-6 py-3.5">Method</th>
                      <th className="px-6 py-3.5">Outcome</th>
                      <th className="px-6 py-3.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {history.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">#{log.seq}</td>
                        <td className="px-6 py-4 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                          {log.credentialId || 'Share Link'}
                        </td>
                        <td className="px-6 py-4 text-slate-900 dark:text-white">{log.universityName}</td>
                        <td className="px-6 py-4 capitalize text-slate-600 dark:text-slate-400">{log.method}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              log.outcome === 'valid'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {log.outcome === 'valid' ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {log.outcome.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: API Keys & Machine Verification */}
        {activeTab === 'api-keys' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    ATS & Machine Verification API Keys
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Connect your Applicant Tracking System (Workday, Greenhouse, Lever) to automatically verify applicant credentials.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={generatingKey}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  {generatingKey ? 'Generating...' : 'Generate New API Key'}
                </button>
              </div>

              {/* Newly Created Key Alert */}
              {newKeyResult && (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                  <div className="font-bold text-sm flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Save Your API Key Now
                  </div>
                  <p className="text-xs mb-3">
                    This secret key will <strong>never be shown again</strong>. Copy it immediately to your secure secrets manager.
                  </p>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 font-mono text-xs">
                    <span className="flex-1 select-all font-bold text-indigo-600 dark:text-indigo-400">
                      {newKeyResult.apiKey}
                    </span>
                    <button
                      onClick={() => copyToClipboard(newKeyResult.apiKey)}
                      className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                      title="Copy Key"
                    >
                      {copiedKey ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Active Keys Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">Key Prefix</th>
                      <th className="px-6 py-3.5">Created Date</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {apiKeys.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-sm">
                          No API keys created yet. Generate an API key to integrate machine verification.
                        </td>
                      </tr>
                    ) : (
                      apiKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                            {k.prefix}••••••••••••••••
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {new Date(k.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            {k.revoked_at ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                Revoked
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!k.revoked_at && (
                              <button
                                onClick={() => handleRevokeKey(k.id)}
                                className="text-xs text-rose-600 hover:text-rose-700 font-semibold transition-colors"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick API Documentation Snippet */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                ATS Machine Verification cURL Example
              </div>
              <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed">
                <code>
                  {`curl -X POST http://localhost:4000/api/employer/verify \\
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "credential_id",
    "query": "TL-G807-HDAB-BZ7R-8"
  }'`}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ATS Batch Verification */}
        {activeTab === 'batch' && (
          <ErrorBoundary fallbackTitle="Batch Verification Service Error">
            <BatchVerification />
          </ErrorBoundary>
        )}

        {/* TAB 6: Document Intelligence */}
        {activeTab === 'document' && (
          <ErrorBoundary fallbackTitle="Document Intelligence Service Error">
            <VerifyDocument />
          </ErrorBoundary>
        )}
      </div>

      <FaceComparisonModal
        isOpen={isBioModalOpen}
        onClose={() => setIsBioModalOpen(false)}
        referencePhotoUrl={
          verifyResult?.logoUrl ||
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80'
        }
        candidateName={
          (verifyResult?.disclosedClaims && (verifyResult.disclosedClaims.studentName || verifyResult.disclosedClaims.fullName)) ||
          'Candidate'
        }
        credentialId={verifyResult?.credentialId}
      />

      <DigiLockerModal
        isOpen={isDigiModalOpen}
        onClose={() => setIsDigiModalOpen(false)}
        credentialId={verifyResult?.credentialId || 'TL-G807-HDAB-BZ7R-8'}
        onDocumentPulled={() => {
          setActiveTab('document');
        }}
      />
    </AppShell>
  );
}
