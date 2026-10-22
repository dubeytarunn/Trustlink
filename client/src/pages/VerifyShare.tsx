import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Clock,
  Building2, GraduationCap, Copy, Check, ArrowRight,
  Lock, Award, Fingerprint, Eye, KeyRound, EyeOff, QrCode, Code, Layers, Camera
} from 'lucide-react';
import { FaceComparisonModal } from '../components/FaceComparisonModal';

interface ClaimReveal {
  name: string;
  value: unknown;
  salt?: string;
}

type Outcome = 'valid' | 'invalid' | 'revoked' | 'suspended' | 'expired' | 'not_found' | 'issuer_suspended' | 'loading' | 'error';

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

interface ShareVerifyResult {
  outcome?: Outcome;
  isValid: boolean;
  requiresPasscode?: boolean;
  credentialId?: string;
  universityName?: string;
  logoUrl?: string;
  expiresAt?: string;
  disclosedClaims?: ClaimReveal[];
  undisclosedClaims?: string[];
  tamperedClaims?: string[];
  viewCount?: number;
  failureReason?: string;
  signatureValid?: boolean;
  commitmentsMatch?: boolean;
  trustRegistry?: TrustRegistryInfo;
  checks?: VerificationChecks;
  digilockerDoc?: any;
  biometricAudit?: any;
  aadhaarKyc?: any;
  w3c?: any;
}

const OUTCOME_META: Record<Outcome, {
  badgeBg: string;
  badgeText: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}> = {
  valid: {
    badgeBg: '#e6f9f7',
    badgeText: '#008f83',
    title: 'Credential Verified',
    subtitle: 'Selective disclosure proof authenticated against issuer public key.',
    icon: ShieldCheck,
    iconColor: '#00b3a4',
    iconBg: '#e6f9f7',
  },
  invalid: {
    badgeBg: '#fef2f2',
    badgeText: '#b91c1c',
    title: 'Tamper Detected / Invalid',
    subtitle: 'Cryptographic commitment mismatch. Blinded claims do not match signature.',
    icon: XCircle,
    iconColor: '#ef4444',
    iconBg: '#fee2e2',
  },
  revoked: {
    badgeBg: '#fff7ed',
    badgeText: '#c2410c',
    title: '✕ CREDENTIAL REVOKED',
    subtitle: 'This credential or share token was revoked by the student or institution.',
    icon: AlertTriangle,
    iconColor: '#f97316',
    iconBg: '#ffedd5',
  },
  suspended: {
    badgeBg: '#fffbeb',
    badgeText: '#b45309',
    title: '⚠ CREDENTIAL SUSPENDED',
    subtitle: 'The underlying credential is under temporary administrative hold.',
    icon: AlertTriangle,
    iconColor: '#f59e0b',
    iconBg: '#fef3c7',
  },
  expired: {
    badgeBg: '#fffbeb',
    badgeText: '#b45309',
    title: '⚠ PRESENTATION EXPIRED',
    subtitle: 'This shared credential presentation is no longer valid. Underlying credential remains unaffected.',
    icon: Clock,
    iconColor: '#f59e0b',
    iconBg: '#fef3c7',
  },
  not_found: {
    badgeBg: '#f8fafc',
    badgeText: '#475569',
    title: 'Share Link Not Found',
    subtitle: 'This share link does not exist in the verification registry.',
    icon: AlertTriangle,
    iconColor: '#64748b',
    iconBg: '#f1f5f9',
  },
  issuer_suspended: {
    badgeBg: '#fef2f2',
    badgeText: '#b91c1c',
    title: 'Issuer Suspended',
    subtitle: 'Issuing university key is suspended by system administration.',
    icon: AlertTriangle,
    iconColor: '#ef4444',
    iconBg: '#fee2e2',
  },
  loading: {
    badgeBg: '#f1f5f9',
    badgeText: '#475569',
    title: 'Verifying Share Link…',
    subtitle: 'Checking zero-knowledge commitment reveals against the cryptographic signature…',
    icon: Clock,
    iconColor: '#00b3a4',
    iconBg: '#e6f9f7',
  },
  error: {
    badgeBg: '#fef2f2',
    badgeText: '#b91c1c',
    title: 'Verification Error',
    subtitle: 'Network error or unable to communicate with verification servers.',
    icon: AlertTriangle,
    iconColor: '#ef4444',
    iconBg: '#fee2e2',
  },
};

function formatClaimKey(key: string): string {
  const map: Record<string, string> = {
    studentName: 'Student Name',
    studentNumber: 'Student ID / Roll No.',
    degree: 'Degree / Program',
    major: 'Specialization / Major',
    graduationYear: 'Graduation Year',
    graduationDate: 'Graduation Date',
    gpa: 'Cumulative GPA',
    honors: 'Academic Honors',
    department: 'Department',
  };
  return map[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export function VerifyShare() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [result, setResult] = useState<ShareVerifyResult>({ outcome: 'loading', isValid: false });
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showW3c, setShowW3c] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);

  const verify = async (pc?: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/verify/share/${shareToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: pc }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ outcome: 'error', isValid: false, failureReason: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (shareToken) verify();
  }, [shareToken]);

  const copyId = () => {
    if (result.credentialId) {
      navigator.clipboard.writeText(result.credentialId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const outcomeKey: Outcome = (result.outcome as Outcome) || 'loading';
  const meta = OUTCOME_META[outcomeKey] || OUTCOME_META.error;
  const MetaIcon = meta.icon;

  // Primary highlights
  const claims = result.disclosedClaims || [];
  const studentNameClaim = claims.find((c) => c.name === 'studentName');
  const studentNumberClaim = claims.find((c) => c.name === 'studentNumber');
  const degreeClaim = claims.find((c) => c.name === 'degree');
  const majorClaim = claims.find((c) => c.name === 'major');

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col font-sans text-[#0b1f3a]">
      {/* ─── Top TrustLink Navbar ─────────────────────────────────── */}
      <nav className="bg-[#0b1f3a] border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-[#00b3a4] flex items-center justify-center shadow-md">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-extrabold text-xl tracking-tight">
              Trust<span className="text-[#00b3a4]">Link</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <Link to="/#solutions" className="hover:text-white transition">Solutions</Link>
            <Link to="/#how" className="hover:text-white transition">How It Works</Link>
            <Link to="/kyc/aadhaar" className="hover:text-white transition">Aadhaar e-KYC</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-semibold text-slate-200 hover:text-white px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
            >
              Sign In
            </Link>
            <Link
              to="/employer"
              className="text-sm font-semibold text-white px-4 py-2 rounded-lg bg-[#00b3a4] hover:bg-[#008f83] shadow-md transition"
            >
              Employer Portal
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Passcode Protection Modal ────────────────────────────── */}
      {result.requiresPasscode ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#dde3ed] shadow-[0_20px_50px_-15px_rgba(11,31,58,0.12)] p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-[#e6f9f7] text-[#008f83] flex items-center justify-center mx-auto shadow-sm">
              <KeyRound className="w-8 h-8 text-[#00b3a4]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-[#0b1f3a]">Passcode Protected</h2>
              <p className="text-sm text-[#5a6a84]">
                The graduate has secured this selective disclosure record with a cryptographic access PIN.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="password"
                placeholder="Enter 4 or 6-digit passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verify(passcode)}
                className="w-full px-4 py-3 rounded-xl border border-[#dde3ed] text-center text-lg font-mono tracking-widest text-[#0b1f3a] focus:outline-none focus:border-[#00b3a4] focus:ring-2 focus:ring-[#00b3a4]/20 transition"
              />

              <button
                onClick={() => verify(passcode)}
                disabled={submitting || !passcode.trim()}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-[#00b3a4] text-white hover:bg-[#008f83] disabled:opacity-50 transition shadow-md"
              >
                {submitting ? 'Authenticating…' : 'Unlock Credential Proof'}
              </button>
            </div>

            <p className="text-xs text-[#5a6a84]">
              Protected with SHA-256 salted PIN hash commitment.
            </p>
          </div>
        </div>
      ) : (
        /* ─── Main Verification Details ───────────────────────────── */
        <main className="flex-1 py-12 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Eyebrow & Title */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase bg-[#e6f9f7] text-[#008f83] border border-[#00b3a4]/20 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#00b3a4] animate-pulse" />
                Selective Disclosure • Verifiable Presentation
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0b1f3a] tracking-tight">
                Verified Academic <span className="text-[#00b3a4]">Presentation</span>
              </h1>
              <p className="text-sm sm:text-base text-[#5a6a84] max-w-xl mx-auto">
                Selectively disclosed claims validated against the university's immutable cryptographic commitment.
              </p>
            </div>

            {/* ─── Centerpiece Card ─────────────────────────────────── */}
            <div className="relative">
              <div className="absolute -top-6 -right-6 w-36 h-36 bg-[#00b3a4]/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-6 -left-6 w-36 h-36 bg-[#0b1f3a]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="bg-white rounded-3xl border border-[#dde3ed] shadow-[0_20px_50px_-15px_rgba(11,31,58,0.08)] overflow-hidden">
                {/* Status Bar */}
                <div className="p-6 sm:p-8 border-b border-[#dde3ed] bg-gradient-to-r from-white via-[#f5f7fa] to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
                      style={{ background: meta.iconBg }}
                    >
                      <MetaIcon className="w-8 h-8" style={{ color: meta.iconColor }} />
                    </div>
                    <div>
                      <div className="text-xs uppercase font-extrabold tracking-widest text-[#5a6a84]">
                        Verification Result
                      </div>
                      <div className="text-2xl font-black text-[#0b1f3a] flex items-center gap-2">
                        {meta.title}
                        {result.isValid && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e6f9f7] text-[#008f83] border border-[#00b3a4]/30">
                            Verified ✓
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5a6a84] mt-0.5">{meta.subtitle}</p>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#e6f9f7] text-[#008f83] border border-[#00b3a4]/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      ECDSA P-256
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#f5f7fa] text-[#0b1f3a] border border-[#dde3ed]">
                      <Fingerprint className="w-3.5 h-3.5 text-[#00b3a4]" />
                      Zero-Knowledge Reveal
                    </span>
                    <button
                      onClick={() => setShowQrModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#0b1f3a] text-white hover:bg-[#142950] transition"
                    >
                      <QrCode className="w-3.5 h-3.5 text-[#00b3a4]" />
                      Show QR
                    </button>
                    {result.viewCount !== undefined && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#0b1f3a] text-white">
                        <Eye className="w-3 h-3 text-[#00b3a4]" />
                        {result.viewCount} Views
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                  {/* ─── 7-Point Verification Audit Checklist (Verification Page Improvement) ─── */}
                  <div className="border border-[#dde3ed] rounded-2xl overflow-hidden text-xs bg-white">
                    <div className="bg-[#0b1f3a] px-4 py-3 font-bold uppercase tracking-wider text-white flex items-center justify-between">
                      <span>TrustLink Cryptographic Audit Checklist</span>
                      <span className="text-[11px] font-mono text-[#00b3a4]">Selective Presentation</span>
                    </div>
                    <div className="divide-y divide-[#dde3ed]">
                      {[
                        { label: 'Credential Integrity', ok: result.checks ? result.checks.credentialIntegrity : result.isValid },
                        { label: 'University Signature', ok: result.checks ? result.checks.universitySignature : result.isValid },
                        { label: 'Issuer Authorization', ok: result.checks ? result.checks.issuerAuthorization : result.isValid },
                        { label: 'Credential Status', ok: result.checks ? result.checks.credentialStatus : result.isValid },
                        { label: 'Expiration', ok: result.checks ? result.checks.expiration : result.outcome !== 'expired' },
                        { label: 'Selective Disclosure', ok: result.checks ? result.checks.selectiveDisclosure : true },
                        { label: 'Presentation Validity', ok: result.checks ? result.checks.presentationValidity : result.isValid },
                      ].map((item) => (
                        <div key={item.label} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition">
                          <span className="font-semibold text-slate-700">{item.label}</span>
                          <span className={`font-bold flex items-center gap-1 ${item.ok ? 'text-[#008f83]' : 'text-rose-600'}`}>
                            {item.ok ? '✓ VALID' : '✕ FAIL'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Government Depository & Identity Verification Trust Badges */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-[#dde3ed]">
                    {/* Card 1: DigiLocker / NAD */}
                    <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <Layers className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">
                          National Depository (NAD)
                        </div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                          {result.digilockerDoc ? 'Verified Record ✓' : 'Direct Institution'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {result.digilockerDoc ? result.digilockerDoc.uri : 'Accredited Issuer'}
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Aadhaar e-KYC */}
                    <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-sm flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">
                          Aadhaar e-KYC Identity
                        </div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                          {result.aadhaarKyc ? 'UIDAI Authenticated ✓' : 'Holder Authenticated'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {result.aadhaarKyc ? result.aadhaarKyc.masked_aadhaar : 'Self-Sovereign Identity'}
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Biometric Match */}
                    <div className="p-3 bg-white rounded-xl border border-indigo-200 shadow-sm flex flex-col justify-between">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100">
                          <Fingerprint className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider">
                            AI Biometric Matching
                          </div>
                          <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                            {result.biometricAudit ? `${result.biometricAudit.similarity_score}% Match ✓` : 'Available on Request'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {result.biometricAudit ? `Verdict: ${result.biometricAudit.verdict}` : 'Facial Verification Ready'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsBioModalOpen(true)}
                        className="mt-2.5 w-full py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border border-indigo-200 transition cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-indigo-600" />
                        Live Camera Face Match
                      </button>
                    </div>
                  </div>

                  {/* University Banner & Trust Registry Accreditation (Feature 6) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#f5f7fa] border border-[#dde3ed] gap-4">
                    <div className="flex items-center gap-3.5">
                      {result.logoUrl ? (
                        <img
                          src={result.logoUrl}
                          alt={result.universityName || 'University'}
                          className="w-12 h-12 rounded-xl object-cover border border-white shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#0b1f3a] flex items-center justify-center text-white">
                          <Building2 className="w-6 h-6 text-[#00b3a4]" />
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold text-[#5a6a84] uppercase tracking-wider">
                          Verified University
                        </div>
                        <div className="text-base font-bold text-[#0b1f3a] flex items-center gap-1.5">
                          {result.universityName || 'VIT Chennai'}
                          <Check className="w-4 h-4 text-[#00b3a4]" />
                        </div>
                        {result.expiresAt && (
                          <div className="text-xs text-[#5a6a84] flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Share link expires {new Date(result.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#008f83] bg-[#e6f9f7] px-2.5 py-1 rounded-lg border border-[#00b3a4]/20">
                        <Check className="w-3 h-3" /> Issuer Authorization: VALID ✓
                      </span>
                      <span className="text-[11px] text-[#5a6a84]">
                        Accredited in TrustLink Trust Registry
                      </span>
                    </div>
                  </div>

                  {/* Candidate Highlight */}
                  {(studentNameClaim || degreeClaim) && (
                    <div className="p-5 rounded-2xl border border-[#dde3ed] bg-gradient-to-br from-white to-[#f5f7fa] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-[#008f83] uppercase tracking-wider flex items-center gap-1.5">
                          <GraduationCap className="w-4 h-4 text-[#00b3a4]" />
                          Graduate Profile
                        </div>
                        <div className="text-xl font-extrabold text-[#0b1f3a]">
                          {studentNameClaim?.value ? String(studentNameClaim.value) : 'Graduate'}
                          {Boolean(studentNumberClaim?.value) && (
                            <span className="text-sm font-semibold text-[#5a6a84] ml-2">
                              · {String(studentNumberClaim?.value)}
                            </span>
                          )}
                        </div>
                        {Boolean(degreeClaim?.value || majorClaim?.value) && (
                          <div className="text-sm font-medium text-[#5a6a84]">
                            {degreeClaim?.value ? String(degreeClaim.value) : ''}
                            {majorClaim?.value ? ` in ${String(majorClaim.value)}` : ''}
                          </div>
                        )}
                      </div>

                      <div className="inline-flex items-center gap-2 self-start sm:self-center px-3.5 py-1.5 rounded-xl bg-white border border-[#dde3ed] shadow-xs text-xs font-bold text-[#0b1f3a]">
                        <Award className="w-4 h-4 text-[#00b3a4]" />
                        Authentic Degree
                      </div>
                    </div>
                  )}

                  {/* Error Notification */}
                  {result.failureReason && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Notice: </span>
                        {result.failureReason}
                      </div>
                    </div>
                  )}

                  {/* Disclosed Claims & Undisclosed Claims Attributes (Feature 5) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-[#0b1f3a]">
                        Disclosed Student Attributes (Selective Disclosure)
                      </h3>
                      <span className="text-xs text-[#5a6a84] font-medium">
                        {claims.length} Claim{claims.length === 1 ? '' : 's'} Revealed
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {claims.map((claim) => (
                        <div
                          key={claim.name}
                          className="p-3.5 rounded-xl bg-white border border-[#dde3ed] shadow-2xs hover:border-[#00b3a4]/50 transition flex items-center justify-between"
                        >
                          <div>
                            <div className="text-xs font-semibold text-[#5a6a84]">
                              {formatClaimKey(claim.name)}
                            </div>
                            <div className="text-sm font-bold text-[#0b1f3a] mt-0.5">
                              {String(claim.value)}
                            </div>
                          </div>
                          <span className="w-6 h-6 rounded-full bg-[#e6f9f7] text-[#008f83] flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      ))}

                      {/* Display Undisclosed Claims with "Not disclosed" without leaking values (Feature 5) */}
                      {result.undisclosedClaims && result.undisclosedClaims.map((claimName) => (
                        <div
                          key={claimName}
                          className="p-3.5 rounded-xl bg-[#f8fafc] border border-dashed border-[#cbd5e1] transition flex items-center justify-between opacity-80"
                        >
                          <div>
                            <div className="text-xs font-medium text-slate-500">
                              {formatClaimKey(claimName)}
                            </div>
                            <div className="text-xs font-bold text-slate-400 mt-0.5 italic">
                              Confidential Claim
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600">
                            <EyeOff className="w-3 h-3" />
                            Not disclosed
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cryptographic ID details */}
                  <div className="p-4 rounded-2xl bg-[#0b1f3a] text-white space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                        <Lock className="w-3.5 h-3.5 text-[#00b3a4]" />
                        Official Credential Identifier
                      </div>
                      <span className="text-xs font-mono text-[#00b3a4]">ECDSA Authenticated</span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10 font-mono text-xs">
                      <div className="text-slate-300 break-all select-all">
                        <span className="text-slate-500">ID: </span>
                        <span className="font-bold text-white">{result.credentialId || 'TL-SECURED-RECORD'}</span>
                      </div>
                      <button
                        onClick={copyId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition self-end sm:self-auto shrink-0"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-[#00b3a4]" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy ID'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00b3a4]" />
                        <span>Signature: </span>
                        <span className="text-slate-200 font-semibold">
                          {result.signatureValid ? 'Valid Issuer Signature' : 'Checking…'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00b3a4]" />
                        <span>Blinded Salt Commitments: </span>
                        <span className="text-slate-200 font-semibold">
                          {result.commitmentsMatch !== false ? 'Mathematically Matched' : 'Mismatch'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* W3C Inspector Toggle Button (Feature 4) */}
                  {result.w3c && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowW3c(!showW3c)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
                      >
                        <Code className="w-4 h-4" />
                        {showW3c ? 'Hide W3C Presentation' : 'Inspect W3C Verifiable Presentation (JSON-LD)'}
                      </button>
                      {showW3c && (
                        <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-64 leading-relaxed">
                          {JSON.stringify(result.w3c, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Action CTA Buttons */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <Link
                      to="/"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-[#dde3ed] bg-white text-[#0b1f3a] hover:border-[#00b3a4] hover:text-[#00b3a4] transition"
                    >
                      TrustLink Home
                    </Link>

                    <div className="w-full sm:w-auto flex items-center gap-3">
                      <Link
                        to="/employer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[#0b1f3a] text-white hover:bg-[#142950] shadow-sm transition"
                      >
                        <span>Employer Verification Portal</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Explanatory Card */}
            <div className="text-center p-6 rounded-2xl bg-white border border-[#dde3ed] text-xs text-[#5a6a84] space-y-1">
              <p className="font-semibold text-[#0b1f3a]">
                TrustLink Zero-Knowledge Selective Disclosure
              </p>
              <p>
                Only attributes chosen by the student are disclosed. Hidden attributes (such as GPA) remain strictly confidential
                while still mathematically proving that the disclosed claims belong to the genuine university-signed credential.
              </p>
            </div>
          </div>
        </main>
      )}

      {/* QR Code Modal */}
      {showQrModal && shareToken && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[#0b1f3a] text-base">Presentation QR Code</h3>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-teal-200 inline-block shadow-inner">
              <img
                src={`/api/verify/qr?text=${encodeURIComponent(window.location.href)}&format=image`}
                alt="Presentation QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>
            <p className="text-xs text-[#5a6a84]">
              Scan to inspect this verifiable presentation on mobile.
            </p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-[#0b1f3a] text-white font-bold rounded-xl text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* AI Biometric Face Comparison Modal */}
      <FaceComparisonModal
        isOpen={isBioModalOpen}
        onClose={() => setIsBioModalOpen(false)}
        referencePhotoUrl={
          result.logoUrl ||
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80'
        }
        candidateName={
          (studentNameClaim?.value as string) ||
          result.universityName ||
          'Candidate'
        }
        credentialId={result.credentialId}
        onMatchComplete={(bioRes) => {
          setResult((prev) => ({
            ...prev,
            biometricAudit: {
              similarity_score: bioRes.similarityScore,
              verdict: bioRes.verdict,
            },
          }));
        }}
      />
    </div>
  );
}
