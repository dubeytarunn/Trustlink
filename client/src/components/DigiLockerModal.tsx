import { useState, useEffect } from 'react';
import {
  X,
  XCircle,
  RefreshCw,
  Search,
  Layers,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { api } from '../lib/api';

interface DigiLockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentialId?: string;
  onDocumentPulled?: (doc: any) => void;
}

interface Issuer {
  orgId: string;
  name: string;
  category: string;
  docTypes: string[];
}

export function DigiLockerModal({
  isOpen,
  onClose,
  credentialId = 'TL-G807-HDAB-BZ7R-8',
  onDocumentPulled,
}: DigiLockerModalProps) {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [loadingIssuers, setLoadingIssuers] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('in.ac.vit');
  const [docType, setDocType] = useState('DEGREE');
  const [rollNumber, setRollNumber] = useState('24BAI1523');
  const [passingYear, setPassingYear] = useState(2026);
  const [candidateName, setCandidateName] = useState('Tarun Dubey');
  const [pulling, setPulling] = useState(false);
  const [pulledDoc, setPulledDoc] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadIssuers();
    }
  }, [isOpen]);

  const loadIssuers = async () => {
    setLoadingIssuers(true);
    try {
      const res = await api.get<{ success: boolean; issuers: Issuer[] }>('/digilocker/issuers');
      if (res.issuers) {
        setIssuers(res.issuers);
      }
    } catch (err) {
      console.warn('Could not load DigiLocker issuers, using fallback list', err);
      setIssuers([
        { orgId: 'in.ac.vit', name: 'Vellore Institute of Technology (VIT)', category: 'UNIVERSITY', docTypes: ['DEGREE', 'MARKSHEET'] },
        { orgId: 'in.ac.iitd', name: 'Indian Institute of Technology Delhi (IIT Delhi)', category: 'INSTITUTE', docTypes: ['DEGREE', 'MARKSHEET'] },
        { orgId: 'in.ac.du', name: 'University of Delhi (Delhi University)', category: 'UNIVERSITY', docTypes: ['DEGREE', 'MARKSHEET'] },
        { orgId: 'in.ac.nitk', name: 'National Institute of Technology Karnataka (NITK)', category: 'INSTITUTE', docTypes: ['DEGREE', 'MARKSHEET'] },
        { orgId: 'in.gov.cbse', name: 'Central Board of Secondary Education (CBSE)', category: 'BOARD', docTypes: ['MARKSHEET'] },
      ]);
    } finally {
      setLoadingIssuers(false);
    }
  };

  const handlePullDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setPulling(true);
    setError('');
    setPulledDoc(null);

    try {
      const res = await api.post<{ success: boolean; document: any }>('/digilocker/pull-doc', {
        orgId: selectedOrgId,
        docType,
        rollNumber,
        passingYear: Number(passingYear),
        candidateName,
        credentialId,
      });

      if (res.document) {
        setPulledDoc(res.document);
        onDocumentPulled?.(res.document);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to pull document from DigiLocker / NAD');
    } finally {
      setPulling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0B1B3A] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Indian Flag colors badge & DigiLocker logo */}
        {/* Header with Sandbox Mode Indicator */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-black text-sm">
              NAD
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                DigiLocker &amp; NAD Integration
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Sandbox Demo Mode
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                National Academic Depository (NAD) Schema Ingestion &amp; Cross-Verification Adapter
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Explicit Sandbox Mode Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 flex items-start gap-3">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold block text-xs">Simulated Sandbox Environment:</span>
              TrustLink connects to an accredited NAD schema simulation adapter. Records pulled here use synthetic test data to demonstrate automated congruence cross-checking against TrustLink ECDSA credentials without querying live government production endpoints.
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handlePullDoc} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Accredited Institution (NAD Issuer)
                </label>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  disabled={loadingIssuers || pulling}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {issuers.map((iss) => (
                    <option key={iss.orgId} value={iss.orgId}>
                      {iss.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  disabled={pulling}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="DEGREE">Degree Certificate</option>
                  <option value="MARKSHEET">Consolidated Marksheet</option>
                  <option value="PROVISIONAL">Provisional Certificate</option>
                  <option value="MIGRATION">Migration Certificate</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Candidate Roll / Registration Number
                </label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="e.g. 24BAI1523"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Candidate Full Name
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="e.g. Tarun Dubey"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Year of Passing / Graduation
                </label>
                <input
                  type="number"
                  value={passingYear}
                  onChange={(e) => setPassingYear(Number(e.target.value))}
                  min={2000}
                  max={2030}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Linked Credential ID: <code className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{credentialId}</code>
              </span>

              <button
                type="submit"
                disabled={pulling}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {pulling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Querying NAD Gateway...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Pull from DigiLocker / NAD
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Pulled Document Certificate Preview */}
          {pulledDoc && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] border border-amber-500/20">
                      SANDBOX RECORD PULLED ✓
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {pulledDoc.uri}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {pulledDoc.candidate.degree} in {pulledDoc.candidate.major}
                  </h3>
                  <p className="text-slate-500">
                    {pulledDoc.issuer.name} &bull; Class of {pulledDoc.candidate.passingYear} &bull; <span className="text-amber-600 dark:text-amber-400 font-medium">(Simulated NAD Test Record)</span>
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {pulledDoc.crossVerification?.congruenceScore || 100}%
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    NAD Congruence
                  </div>
                </div>
              </div>

              {/* Data Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Candidate</span>
                  <span className="font-bold text-slate-900 dark:text-white block truncate">
                    {pulledDoc.candidate.name}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Roll Number</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white block">
                    {pulledDoc.candidate.rollNumber}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">CGPA / Grade</span>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    {pulledDoc.candidate.cgpa}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Classification</span>
                  <span className="font-bold text-slate-900 dark:text-white block truncate">
                    {pulledDoc.candidate.division}
                  </span>
                </div>
              </div>

              {/* Cross Verification Check with TrustLink */}
              {pulledDoc.crossVerification && (
                <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/40 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-blue-900 dark:text-blue-300">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-500" />
                      TrustLink ECDSA &lt;&gt; DigiLocker NAD Cross-Match:
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {pulledDoc.crossVerification.status === 'MATCH' ? '✓ 100% CONGRUENT' : 'REVIEW'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-blue-700 dark:text-blue-400">
                    <span>Candidate Name: {pulledDoc.crossVerification.claimsMatched.name ? '✓' : '✕'}</span>
                    <span>Roll Number: {pulledDoc.crossVerification.claimsMatched.rollNumber ? '✓' : '✕'}</span>
                    <span>Degree Title: {pulledDoc.crossVerification.claimsMatched.degree ? '✓' : '✕'}</span>
                    <span>Graduation Year: {pulledDoc.crossVerification.claimsMatched.passingYear ? '✓' : '✕'}</span>
                  </div>
                </div>
              )}

              {/* Digital Signature Proof */}
              <div className="text-[10px] text-slate-500 font-mono bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg flex items-center justify-between">
                <span>{pulledDoc.nadDigitalSignature.issuerCert}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">SANDBOX SIGNATURE VALID</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Schema: MeitY National Academic Depository (NAD) v2.4.0 (Sandbox Mode)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
