import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck, ArrowRight, CheckCircle2, Building2,
  GraduationCap, Users, Zap, Globe, Lock, Menu, X,
  AlertTriangle, XCircle, EyeOff, Award, Check, ExternalLink, RefreshCw
} from 'lucide-react';

const STATS = [
  { value: '100%',    label: 'Cryptographic Integrity' },
  { value: '< 1 ms',  label: 'Signature Verification'  },
  { value: 'P-256',   label: 'ECDSA Curve Standard'    },
  { value: 'W3C VC',  label: 'Data Model Compatibility'},
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'ECDSA P-256 Digital Signatures',
    desc: 'Every degree and certificate is mathematically signed by the university with an isolated private key. Any bit modification instantly triggers a verification failure.',
    badge: 'Cryptographic Trust'
  },
  {
    icon: Globe,
    title: 'Zero-Knowledge Selective Disclosure',
    desc: 'Pedersen commitments allow students to prove qualification authenticity while keeping sensitive claims (such as GPA or student number) strictly confidential.',
    badge: 'Privacy Preserving'
  },
  {
    icon: Zap,
    title: '7-Point Verification Audit',
    desc: 'Every verification executes a comprehensive 7-point audit across signature validity, integrity commitments, issuer authorization, and revocation status.',
    badge: 'Automated Verifier'
  },
  {
    icon: Award,
    title: 'W3C Verifiable Credentials',
    desc: 'Native JSON-LD W3C Verifiable Credential 1.1 / 2.0 schema output alongside printable tamper-evident PDF certificates with embedded QR codes.',
    badge: 'Interoperable Standards'
  },
  {
    icon: Lock,
    title: 'Append-Only Hash-Chained Audit',
    desc: 'Privileged operations and verification events are recorded in an immutable append-only ledger chained via SHA-256 hash proofs.',
    badge: 'Tamper Evident'
  },
  {
    icon: Building2,
    title: 'Accredited University Trust Registry',
    desc: 'Public key infrastructure linking institutions, public key fingerprints, and accreditation status without centralized certificate authorities.',
    badge: 'Decentralized PKI'
  },
];

const SAMPLE_DEMO_CREDENTIALS = [
  {
    id: 'TL-G807-HDAB-BZ7R-8',
    label: 'Authentic Degree',
    type: 'degree',
    student: 'Tarun Dubey',
    degree: 'Bachelor of Science (Computer Science & AI)',
    expected: 'VALID',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    description: 'Fully authentic, cryptographically signed academic credential.'
  },
  {
    id: 'demo-share-verified-token',
    label: 'Selective Disclosure',
    type: 'share',
    student: 'Tarun Dubey',
    degree: 'Selective Presentation (GPA Hidden)',
    expected: 'VALID',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    description: 'Privacy-preserving presentation with hidden GPA commitment.'
  },
  {
    id: 'TL-SUSPEND-DEMO-0002-B',
    label: 'Suspended Credential',
    type: 'degree',
    student: 'Sarah Jenkins',
    degree: 'Master of Data Engineering',
    expected: 'SUSPENDED',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    description: 'Credential placed under temporary institutional administrative hold.'
  },
  {
    id: 'TL-REVOKED-DEMO-0001-A',
    label: 'Revoked Credential',
    type: 'degree',
    student: 'Tarun Dubey',
    degree: 'Associate Diploma in Systems',
    expected: 'REVOKED',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    description: 'Officially revoked by institution — cryptographic check flags invalidation.'
  },
  {
    id: 'demo-share-expired-token',
    label: 'Expired Presentation',
    type: 'share',
    student: 'Tarun Dubey',
    degree: 'Temporary Scoped Share Link',
    expected: 'EXPIRED',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    description: 'Share link passed expiration threshold without affecting underlying degree.'
  },
];

const DEMO_ACCOUNTS = [
  { role: 'student',    label: 'Student Digital Wallet',    email: 'student@university.edu', pass: 'Password123!', path: '/student',              icon: Users, desc: 'Manage credentials, selective disclosure & share tokens' },
  { role: 'university', label: 'University Authority',      email: 'admin@vit.edu',          pass: 'Password123!', path: '/university',           icon: GraduationCap, desc: 'Issue, cryptographically sign, suspend & revoke degrees' },
  { role: 'employer',   label: 'Employer Verifier',         email: 'recruiter@acme.com',     pass: 'Password123!', path: '/employer',             icon: Building2, desc: 'Instant 7-point audit, ATS batch verify & document OCR' },
  { role: 'admin',      label: 'Network Governance',        email: 'admin@trustlink.demo',   pass: 'DemoAdmin123!', path: '/admin/universities',  icon: ShieldCheck, desc: 'Accreditation, key lifecycle & append-only audit trail' },
];

export function Landing() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [verifyId, setVerifyId] = useState('TL-G807-HDAB-BZ7R-8');
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);

  const handleQuickVerify = async (idToVerify?: string) => {
    const target = (idToVerify || verifyId).trim();
    if (!target) return;
    setVerifying(true);
    setVerifyResult(null);

    try {
      const isShare = target.startsWith('demo-share') || target.length > 25;
      const url = isShare ? `/api/verify/share/${encodeURIComponent(target)}` : `/api/verify/credential/${encodeURIComponent(target)}`;
      const r = isShare 
        ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
        : await fetch(url);
      
      const d = await r.json();
      setVerifyResult({
        target,
        isShare,
        outcome: d.outcome || (d.isValid ? 'valid' : 'invalid'),
        isValid: !!d.isValid,
        universityName: d.universityName || 'Accredited Institution',
        failureReason: d.failureReason,
        checks: d.checks,
        disclosedClaims: d.disclosedClaims,
        undisclosedClaims: d.undisclosedClaims,
      });
    } catch (err: any) {
      setVerifyResult({
        target,
        outcome: 'error',
        isValid: false,
        failureReason: err.message || 'Network error connecting to TrustLink verification ledger',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleDemoLogin = async (acc: typeof DEMO_ACCOUNTS[0]) => {
    setLogging(acc.role);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.pass }),
      });
      const data = await res.json();
      if (res.ok && data.accessToken && data.user) {
        login(data.user, data.accessToken);
        navigate(acc.path);
      } else {
        navigate('/login');
      }
    } catch {
      navigate('/login');
    } finally {
      setLogging(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#070F20] text-slate-100 font-sans selection:bg-[#00b3a4] selection:text-white">
      {/* ─── Top Navigation Bar ────────────────────────────────────────── */}
      <nav className="border-b border-slate-800/80 bg-[#070F20]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00b3a4] to-indigo-500 flex items-center justify-center shadow-lg shadow-[#00b3a4]/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-white">
                Trust<span className="text-[#00b3a4]">Link</span>
              </span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#00b3a4]/10 text-[#00b3a4] border border-[#00b3a4]/20">
                Enterprise
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#verify" className="hover:text-[#00b3a4] transition-colors">Public Verifier</a>
            <a href="#samples" className="hover:text-[#00b3a4] transition-colors">Test Bench</a>
            <a href="#features" className="hover:text-[#00b3a4] transition-colors">Architecture</a>
            <a href="#portals" className="hover:text-[#00b3a4] transition-colors">Role Portals</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 text-slate-200 transition-all"
            >
              Sign In
            </Link>
            <a
              href="#verify"
              className="text-xs font-bold px-4 py-2.5 rounded-xl bg-[#00b3a4] hover:bg-[#008f83] text-white shadow-lg shadow-[#00b3a4]/20 transition-all"
            >
              Verify Credential
            </a>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-[#070F20] px-4 py-4 space-y-3 text-sm">
            <a href="#verify" onClick={() => setMenuOpen(false)} className="block text-slate-300 hover:text-[#00b3a4]">Public Verifier</a>
            <a href="#samples" onClick={() => setMenuOpen(false)} className="block text-slate-300 hover:text-[#00b3a4]">Test Bench</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="block text-slate-300 hover:text-[#00b3a4]">Architecture</a>
            <a href="#portals" onClick={() => setMenuOpen(false)} className="block text-slate-300 hover:text-[#00b3a4]">Role Portals</a>
          </div>
        )}
      </nav>

      {/* ─── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-20 border-b border-slate-800/60 bg-gradient-to-b from-[#070F20] via-[#09152e] to-[#070F20]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#00b3a4]/10 text-[#00b3a4] border border-[#00b3a4]/20">
                <span className="w-2 h-2 rounded-full bg-[#00b3a4] animate-pulse" />
                Decentralized Academic Credential Verification Platform
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
                Cryptographic Trust for <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00b3a4] via-emerald-400 to-indigo-400">
                  Academic Credentials
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl font-normal">
                Connecting Universities (Issuers), Students (Holders), and Employers (Verifiers) with
                ECDSA P-256 digital signatures, W3C Verifiable Credentials, zero-knowledge selective disclosure, and an immutable audit ledger.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <a
                  href="#verify"
                  className="px-6 py-3.5 rounded-xl bg-[#00b3a4] hover:bg-[#008f83] text-white font-bold text-sm shadow-xl shadow-[#00b3a4]/20 transition-all flex items-center gap-2"
                >
                  Launch Verification Portal <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#portals"
                  className="px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-white font-bold text-sm transition-all flex items-center gap-2"
                >
                  Explore Demo Portals
                </a>
              </div>
            </div>

            {/* Hero Visual Card: 7-Point Audit Preview */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl space-y-5 backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00b3a4]/10 border border-[#00b3a4]/20 flex items-center justify-center text-[#00b3a4]">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">Live Proof Verification</div>
                      <div className="text-sm font-bold text-white">TrustLink 7-Point Ledger Check</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    REALTIME PKI
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { label: 'Credential Integrity', note: 'Pedersen commitment match' },
                    { label: 'University Signature', note: 'ECDSA P-256 verified' },
                    { label: 'Issuer Authorization', note: 'Accredited in Trust Registry' },
                    { label: 'Lifecycle Status', note: 'Authoritative active status' },
                    { label: 'Expiration Horizon', note: 'Validity window check' },
                    { label: 'Selective Disclosure', note: 'Zero-knowledge claim privacy' },
                    { label: 'Presentation Validity', note: 'Cryptographic binding check' },
                  ].map((chk, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-800/60">
                      <div>
                        <span className="font-semibold text-slate-200">{chk.label}</span>
                        <span className="text-[10px] text-slate-400 block">{chk.note}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 text-xs flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> PASS
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Standard: RFC 6979 / NIST P-256</span>
                  <span className="text-[#00b3a4] font-mono">0.30 ms latency</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            {STATS.map((s, idx) => (
              <div key={idx} className="text-center space-y-1">
                <div className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#00b3a4] to-emerald-400">
                  {s.value}
                </div>
                <div className="text-xs text-slate-400 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PUBLIC CREDENTIAL VERIFICATION SECTION ─────────────────────── */}
      <section id="verify" className="py-20 border-b border-slate-800/60 bg-[#070F20]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#00b3a4]">Independent Verifier</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Public Credential Verification Engine
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Verify any TrustLink academic credential ID, verifiable share token, or W3C presentation directly against the public key ledger.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuickVerify();
            }}
            className="space-y-4"
          >
            <div className="relative">
              <input
                type="text"
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Enter Credential ID (e.g. TL-G807-HDAB-BZ7R-8) or Share Token"
                className="w-full px-5 py-4 rounded-2xl bg-slate-900 border-2 border-slate-700 text-white font-mono text-sm sm:text-base focus:outline-none focus:border-[#00b3a4] transition-all pr-36 shadow-lg shadow-black/40"
              />
              <button
                type="submit"
                disabled={verifying || !verifyId.trim()}
                className="absolute right-2 top-2 bottom-2 px-6 rounded-xl bg-[#00b3a4] hover:bg-[#008f83] text-white font-bold text-xs sm:text-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" /> Verify Now
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Verification Result Display */}
          {verifyResult && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  {verifyResult.isValid ? (
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : verifyResult.outcome === 'revoked' ? (
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                      <XCircle className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="font-extrabold text-base text-white">
                      {verifyResult.isValid
                        ? '✓ CRYPTOGRAPHICALLY AUTHENTICATED'
                        : `✕ VERIFICATION RESULT: ${String(verifyResult.outcome).toUpperCase()}`}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Target: {verifyResult.target}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                    {verifyResult.isShare ? 'Selective Share Presentation' : 'Official Degree Credential'}
                  </span>
                </div>
              </div>

              {verifyResult.failureReason && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  {verifyResult.failureReason}
                </div>
              )}

              {/* Claims summary */}
              {verifyResult.disclosedClaims && (
                <div className="space-y-2">
                  <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                    Verified Credential Attributes
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(Array.isArray(verifyResult.disclosedClaims)
                      ? verifyResult.disclosedClaims
                      : Object.entries(verifyResult.disclosedClaims).map(([name, value]) => ({ name, value }))
                    ).map((c: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-800/60 border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-400 capitalize">{c.name || `Field ${idx + 1}`}:</span>
                        <span className="font-bold text-white">{String(c.value ?? '')}</span>
                      </div>
                    ))}
                    {verifyResult.undisclosedClaims?.map((name: string) => (
                      <div key={name} className="p-3 rounded-xl bg-slate-800/30 border border-slate-800/40 flex items-center justify-between text-slate-500">
                        <span className="capitalize">{name}:</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                          <EyeOff className="w-3.5 h-3.5" /> Not Disclosed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800 text-xs">
                <span className="text-slate-400">
                  Institution: <strong className="text-white">{verifyResult.universityName}</strong>
                </span>
                <Link
                  to={verifyResult.isShare ? `/verify/share/${verifyResult.target}` : `/verify/credential/${verifyResult.target}`}
                  target="_blank"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5"
                >
                  Open Full Cryptographic Audit Portal <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── SAMPLE DEMONSTRATION CREDENTIALS (SYNTHETIC BENCH) ────────── */}
      <section id="samples" className="py-20 border-b border-slate-800/60 bg-[#09142b]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
                Synthetic Benchmark
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">
                Sample Test Bench Data
              </h2>
              <p className="text-sm text-slate-400 mt-1 max-w-xl">
                Test the cryptographic engine against known edge cases. Click any sample to run an instant verification audit.
              </p>
            </div>
            <div className="text-xs text-slate-400 bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800">
              <span className="text-emerald-400 font-bold">● Notice:</span> All demo data is synthetic and segregated from live records.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {SAMPLE_DEMO_CREDENTIALS.map((sample) => (
              <div
                key={sample.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${sample.badgeClass}`}>
                      {sample.label}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      Expected: <strong className="text-slate-200">{sample.expected}</strong>
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-white">{sample.degree}</h3>
                  <p className="text-xs text-slate-400">{sample.description}</p>
                  <div className="font-mono text-[11px] text-[#00b3a4] truncate bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                    {sample.id}
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyId(sample.id);
                      handleQuickVerify(sample.id);
                      const el = document.getElementById('verify');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition flex items-center justify-center gap-1.5"
                  >
                    Run Test Verification
                  </button>
                  <Link
                    to={sample.type === 'share' ? `/verify/share/${sample.id}` : `/verify/credential/${sample.id}`}
                    target="_blank"
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                    title="Open standalone verification page"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PLATFORM ARCHITECTURE & PILLARS ───────────────────────────── */}
      <section id="features" className="py-20 border-b border-slate-800/60 bg-[#070F20]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#00b3a4]">Core Capabilities</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Enterprise Identity &amp; Credential Stack
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              A cryptographically secure foundation built for higher-education compliance and employer confidence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-[#00b3a4]/10 border border-[#00b3a4]/20 flex items-center justify-center text-[#00b3a4]">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {feat.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{feat.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── ROLE-SPECIFIC DEMO PORTALS ENTRY POINTS ──────────────────── */}
      <section id="portals" className="py-20 border-b border-slate-800/60 bg-[#09142b]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#00b3a4]">Instant Sandbox Access</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Explore TrustLink by Stakeholder Role
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Click any portal below to authenticate immediately with pre-configured demo credentials.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              const isCurrent = logging === acc.role;
              return (
                <div
                  key={acc.role}
                  className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-[#00b3a4]/50 transition-all flex flex-col justify-between space-y-6 shadow-xl"
                >
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#00b3a4]/20 to-indigo-500/20 border border-[#00b3a4]/30 flex items-center justify-center text-[#00b3a4]">
                      <Icon className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">{acc.label}</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{acc.desc}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                      <div>Email: {acc.email}</div>
                      <div>Pass: ••••••••••••</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDemoLogin(acc)}
                    disabled={!!logging}
                    className="w-full py-3 rounded-xl bg-[#00b3a4] hover:bg-[#008f83] text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-[#00b3a4]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isCurrent ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Authenticating…
                      </>
                    ) : (
                      <>
                        Enter {acc.label} <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Platform Footer ───────────────────────────────────────────── */}
      <footer className="py-12 border-t border-slate-800 bg-[#050B17] text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#00b3a4] flex items-center justify-center text-white">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-bold text-white text-sm">TrustLink Platform</span>
            <span>&bull; NIST P-256 ECDSA &bull; W3C VC Compatible &bull; SHA-256 Audit Trail</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-white transition">Sign In</Link>
            <Link to="/kyc/aadhaar" className="hover:text-white transition">Aadhaar e-KYC Demo</Link>
            <a href="#verify" className="hover:text-white transition">Verify Credential</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
