import { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { api } from '../lib/api';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Smartphone,
  Scan,
  RefreshCw,
  Copy,
  Check,
  Fingerprint,
} from 'lucide-react';
import { FaceComparisonModal } from '../components/FaceComparisonModal';

interface DemoAadhaar {
  aadhaarNumber: string;
  maskedAadhaar: string;
  fullName: string;
  dob: string;
  gender: string;
  phoneLast4: string;
  photoUrl: string | null;
}

interface EkycResult {
  aadhaarNumber: string;
  fullName: string;
  dob: string;
  gender: string;
  address: string;
  phoneLast4: string;
  photoUrl: string | null;
  verifiedAt: string;
  proofHash: string;
  status: string;
}

export function AadhaarKYC() {
  const [demos, setDemos] = useState<DemoAadhaar[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [demoOtpCode, setDemoOtpCode] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ekycResult, setEkycResult] = useState<EkycResult | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Biometric modal state
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);

  useEffect(() => {
    loadDemos();
  }, []);

  const loadDemos = async () => {
    try {
      const res = await api.get<{ demos: DemoAadhaar[] }>('/kyc/aadhaar/demos');
      setDemos(res.demos);
      if (res.demos.length > 0) {
        setAadhaarInput(formatAadhaar(res.demos[0].aadhaarNumber));
      }
    } catch (err) {
      console.error('Failed to load Aadhaar demos', err);
    }
  };

  const formatAadhaar = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 12);
    const parts = [];
    for (let i = 0; i < digits.length; i += 4) {
      parts.push(digits.slice(i, i + 4));
    }
    return parts.join(' ');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAadhaarInput(formatAadhaar(e.target.value));
    setError('');
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = aadhaarInput.replace(/\s/g, '');
    if (cleanNum.length !== 12) {
      setError('Please enter a valid 12-digit Aadhaar number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        demoOtp: string;
        phoneLast4: string;
      }>('/kyc/aadhaar/send-otp', { aadhaarNumber: cleanNum });

      setDemoOtpCode(res.demoOtp);
      setPhoneLast4(res.phoneLast4);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to request OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = aadhaarInput.replace(/\s/g, '');
    setLoading(true);
    setError('');

    try {
      const res = await api.post<{ success: boolean; ekyc: EkycResult }>(
        '/kyc/aadhaar/verify-otp',
        {
          aadhaarNumber: cleanNum,
          otp: otpInput || demoOtpCode,
        }
      );

      setEkycResult(res.ekyc);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyHash = () => {
    if (!ekycResult) return;
    navigator.clipboard.writeText(ekycResult.proofHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleReset = () => {
    setStep(1);
    setOtpInput('');
    setDemoOtpCode('');
    setEkycResult(null);
    setError('');
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8 py-4">
        {/* Header Banner */}
        <div className="relative rounded-3xl overflow-hidden p-8 bg-gradient-to-br from-[#0B1B3A] via-[#0F2854] to-[#0B1B3A] text-white border border-slate-700/60 shadow-xl">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold mb-3">
                <Fingerprint className="w-3.5 h-3.5" />
                Simulated Identity Sandbox (e-KYC Adapter)
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Aadhaar &amp; National Identity Verification
              </h1>
              <p className="text-sm text-slate-300 mt-2 max-w-xl">
                Simulate citizen identity binding using synthetic test records. Evaluates candidate verification workflows with masked identifiers and data minimization principles.
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400"></span>
              <span className="text-xs font-mono font-bold tracking-wider text-amber-300">
                SANDBOX DEMO MODE
              </span>
            </div>
          </div>
        </div>

        {/* Sandbox Notice Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Synthetic Demonstration Protocol:</span>
            {' '}This interface simulates Aadhaar OTP issuance and e-KYC demographic verification using sandbox test data. No live UIDAI databases are queried, and private identity details are minimized.
          </div>
        </div>

        {/* 3-Step Wizard Container */}
        <div className="bg-white dark:bg-[#0B1B3A] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
          {/* Step Indicator */}
          <div className="flex items-center justify-between max-w-md mx-auto mb-8">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  step >= 1
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                1
              </div>
              <span className="text-[11px] font-semibold mt-1 text-slate-600 dark:text-slate-400">
                Aadhaar Number
              </span>
            </div>
            <div
              className={`flex-1 h-0.5 mx-2 transition-all ${
                step >= 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  step >= 2
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                2
              </div>
              <span className="text-[11px] font-semibold mt-1 text-slate-600 dark:text-slate-400">
                OTP Verification
              </span>
            </div>
            <div
              className={`flex-1 h-0.5 mx-2 transition-all ${
                step >= 3 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  step >= 3
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                3
              </div>
              <span className="text-[11px] font-semibold mt-1 text-slate-600 dark:text-slate-400">
                e-KYC Sealed
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Input Aadhaar */}
          {step === 1 && (
            <div className="max-w-md mx-auto space-y-6">
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Enter 12-Digit Aadhaar Number
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={aadhaarInput}
                      onChange={handleInputChange}
                      placeholder="XXXX XXXX XXXX"
                      className="w-full px-4 py-3 text-center text-lg font-mono font-bold tracking-widest rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Connecting to UIDAI Gateway...
                    </>
                  ) : (
                    <>
                      Verify &amp; Send OTP
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Demo Profiles Quick Selector */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                  One-Click Demo Identity Picker:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {demos.map((d) => (
                    <button
                      key={d.aadhaarNumber}
                      type="button"
                      onClick={() => setAadhaarInput(formatAadhaar(d.aadhaarNumber))}
                      className={`p-2.5 text-left rounded-xl border transition-all text-xs flex items-center gap-2.5 ${
                        aadhaarInput.replace(/\s/g, '') === d.aadhaarNumber
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      {d.photoUrl && (
                        <img
                          src={d.photoUrl}
                          alt={d.fullName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                        />
                      )}
                      <div className="truncate">
                        <div className="font-bold">{d.fullName}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {d.maskedAadhaar}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: OTP Verification Screen */}
          {step === 2 && (
            <div className="max-w-md mx-auto space-y-6">
              {/* Simulated Mobile SMS Banner */}
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-indigo-500 text-white">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    Simulated SMS Notification
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 mt-1 font-medium">
                    "UIDAI: One-Time Password for e-KYC on mobile ending in ******{phoneLast4 || '****'} is{' '}
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {demoOtpCode}
                    </span>
                    . Valid for 10 minutes."
                  </div>
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 text-center">
                    Enter 6-Digit OTP Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder={demoOtpCode || '482910'}
                    className="w-full px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.4em] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                  <div className="text-center mt-2">
                    <button
                      type="button"
                      onClick={() => setOtpInput(demoOtpCode)}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Autofill Demo Code ({demoOtpCode})
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-1/3 py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Authenticating...' : 'Confirm & Authenticate'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Verified Digital Identity Card */}
          {step === 3 && ekycResult && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Digital Aadhaar Card */}
              <div className="max-w-2xl mx-auto rounded-3xl overflow-hidden border-2 border-emerald-500/50 bg-gradient-to-b from-white to-slate-50 dark:from-[#0B1B3A] dark:to-[#071328] shadow-2xl p-6 sm:p-8 relative">
                {/* Government Seal Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        Government of India &bull; UIDAI e-KYC
                      </div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        Digital Identity Verification Token
                      </div>
                    </div>
                  </div>

                  <div className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/30">
                    <CheckCircle2 className="w-4 h-4" />
                    AUTHENTICATED
                  </div>
                </div>

                {/* Body: Photo & Demographic Details */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 my-6 items-center">
                  {/* Photo */}
                  <div className="sm:col-span-1 flex flex-col items-center">
                    <div className="relative w-28 h-32 rounded-xl overflow-hidden border-2 border-emerald-500/40 shadow-md">
                      <img
                        src={ekycResult.photoUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256'}
                        alt={ekycResult.fullName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-2">
                      PHOTO MATCH
                    </span>
                  </div>

                  {/* Demographic Fields */}
                  <div className="sm:col-span-3 space-y-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Full Name
                      </div>
                      <div className="text-lg font-black text-slate-900 dark:text-white">
                        {ekycResult.fullName}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Date of Birth
                        </div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {ekycResult.dob}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Gender
                        </div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {ekycResult.gender}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Residential Address
                      </div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {ekycResult.address}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Aadhaar Number
                      </div>
                      <div className="text-base font-mono font-black tracking-wider text-emerald-600 dark:text-emerald-400">
                        {ekycResult.aadhaarNumber}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proof Cryptographic Hash */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      SHA-256 e-KYC Integrity Proof
                    </span>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate block">
                      {ekycResult.proofHash}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 border border-slate-200 dark:border-slate-700"
                    title="Copy Hash"
                  >
                    {copiedHash ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsBioModalOpen(true)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Scan className="w-4 h-4" />
                  Run AI Biometric Face Comparison on this Identity
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-5 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-sm transition-all"
                >
                  Verify Another Aadhaar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Biometric Comparison Modal */}
      {ekycResult && (
        <FaceComparisonModal
          isOpen={isBioModalOpen}
          onClose={() => setIsBioModalOpen(false)}
          referencePhotoUrl={
            ekycResult.photoUrl ||
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256'
          }
          candidateName={ekycResult.fullName}
        />
      )}
    </AppShell>
  );
}
