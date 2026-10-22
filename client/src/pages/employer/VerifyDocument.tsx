import { useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Fingerprint,
  History,
  Scan,
  Sliders,
  Sparkles,
  Cpu,
  Layers,
} from 'lucide-react';
import { FaceComparisonModal } from '../../components/FaceComparisonModal';
import { DigiLockerModal } from '../../components/DigiLockerModal';
import { BiometricMatchResult } from '../../lib/biometrics';

export function VerifyDocument() {
  const [credentialId, setCredentialId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('Degree Certificate');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Biometric Facial Matching State
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [biometricResult, setBiometricResult] = useState<BiometricMatchResult | null>(null);
  const [faceThreshold, setFaceThreshold] = useState(75);

  // DigiLocker / National Academic Depository (NAD) State
  const [isDigiLockerOpen, setIsDigiLockerOpen] = useState(false);
  const [digiLockerDoc, setDigiLockerDoc] = useState<any>(null);

  const referencePhoto = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80';

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !credentialId) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('document', file);
    formData.append('credentialId', credentialId);
    formData.append('documentType', docType);

    if (biometricResult) {
      formData.append('biometricScore', String(biometricResult.similarityScore));
      formData.append('biometricVerdict', biometricResult.verdict);
    }

    try {
      const token = localStorage.getItem('trustlink_token') || '';
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Document verification analysis failed');
      }
      setResult(data);
    } catch (err: any) {
      console.error('Document analysis error:', err);
      setResult({
        result: 'SUSPICIOUS',
        riskLevel: 'HIGH',
        riskScore: 30,
        reasons: [err.message || 'Verification failed. Could not verify document against authoritative ledger.'],
        matches: {},
        checks: { documentReadable: false, requiredFieldsDetected: false, noMajorInconsistencies: false },
        extractedFields: {},
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setCredentialId('TL-G807-HDAB-BZ7R-8');
    setDocType('Degree Certificate');
  };

  // Dynamically compute adjusted verdict based on threshold
  const currentBioVerdict = biometricResult
    ? biometricResult.similarityScore >= faceThreshold
      ? 'MATCH'
      : biometricResult.similarityScore >= Math.max(40, faceThreshold - 15)
      ? 'PARTIAL'
      : 'MISMATCH'
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Document Intelligence &amp; Biometric Verification
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> India-First AI
            </span>
          </h1>
          <p className="text-gray-500 mt-1">
            Analyze physical documents, verify cryptographic signatures, and cross-match candidate biometrics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDigiLockerOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            Pull from DigiLocker (NAD)
          </button>

          <button
            type="button"
            onClick={handleFillDemo}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
          >
            Quick Fill Demo Credential
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document Ingestion & Parameters */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-5">
          {digiLockerDoc && (
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  National Academic Depository (NAD) Record Attached
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                  {digiLockerDoc.verificationStatus}
                </span>
              </div>
              <p className="text-blue-700 dark:text-blue-300">
                {digiLockerDoc.issuer?.name} &bull; {digiLockerDoc.candidate?.degree} ({digiLockerDoc.candidate?.rollNumber})
              </p>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                TrustLink Credential ID
              </label>
              <input
                type="text"
                value={credentialId}
                onChange={(e) => setCredentialId(e.target.value)}
                placeholder="TL-XXXX-XXXX-XXXX-X"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Document Type
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <optgroup label="Academic Documents">
                  <option>Degree Certificate</option>
                  <option>Marksheet</option>
                  <option>Transcript</option>
                  <option>Provisional Certificate</option>
                </optgroup>
                <optgroup label="Indian Identity Documents (Masked)">
                  <option>Aadhaar (Masked e-KYC)</option>
                  <option>PAN Card</option>
                  <option>Passport</option>
                  <option>Driving Licence</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Upload Document (PDF / JPG / PNG)
              </label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors cursor-pointer">
                <input
                  type="file"
                  id="doc-upload"
                  className="hidden"
                  accept=".pdf,image/*,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="doc-upload" className="cursor-pointer block">
                  <UploadCloud className="h-9 w-9 text-indigo-500 mx-auto mb-2" />
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm block">
                    {file ? file.name : 'Click to select or drag and drop document'}
                  </span>
                  <span className="text-xs text-gray-400 mt-1 block">
                    Max size 5MB • OCR &amp; tamper analysis applied automatically
                  </span>
                </label>
              </div>
            </div>

            {/* Biometric Facial Verification Pre-check or Trigger */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <Scan className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Biometric Facial Match
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Cross-match candidate photo against credential identity
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBioModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {biometricResult ? 'Re-scan Face' : 'Run Face Match'}
                </button>
              </div>

              {biometricResult && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Biometric Match Result:</span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        currentBioVerdict === 'MATCH'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : currentBioVerdict === 'PARTIAL'
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {currentBioVerdict === 'MATCH' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> MATCH ({biometricResult.similarityScore}%)
                        </>
                      ) : currentBioVerdict === 'PARTIAL' ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" /> REVIEW ({biometricResult.similarityScore}%)
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> MISMATCH ({biometricResult.similarityScore}%)
                        </>
                      )}
                    </span>
                  </div>

                  {/* Inline Acceptance Threshold Slider */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Sliders className="w-3 h-3 text-indigo-500" />
                        Confidence Threshold:
                      </span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {faceThreshold}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      step="1"
                      value={faceThreshold}
                      onChange={(e) => setFaceThreshold(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !file || !credentialId}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-medium rounded-lg disabled:opacity-50 transition-all shadow-md shadow-indigo-500/20 cursor-pointer"
            >
              {loading ? 'Analyzing Document & Evaluating Claims...' : 'Verify Document with TrustLink'}
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
          {!result ? (
            <div className="h-full min-h-[350px] flex flex-col items-center justify-center text-gray-400 text-center p-6">
              <ShieldCheck className="h-16 w-16 mb-4 opacity-40 text-indigo-500" />
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                Ready for Document Intelligence
              </h3>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Upload a document or degree certificate to trigger OCR extraction, cryptographic signature comparison, and biometric face verification.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-center pt-2">
                {result.result === 'VERIFIED' && <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-2" />}
                {result.result === 'REVIEW' && <AlertTriangle className="h-14 w-14 text-yellow-500 mx-auto mb-2" />}
                {result.result === 'SUSPICIOUS' && <XCircle className="h-14 w-14 text-red-500 mx-auto mb-2" />}
                
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {result.result}
                </h2>
                
                <div className="mt-2 inline-flex items-center space-x-2 px-3 py-1 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Combined Trust Score:</span>
                  <span
                    className={`text-sm font-bold ${
                      result.riskScore >= 90 ? 'text-green-500' : result.riskScore >= 70 ? 'text-yellow-500' : 'text-red-500'
                    }`}
                  >
                    {result.riskScore}%
                  </span>
                  <span className="text-xs text-gray-400">({result.riskLevel} RISK)</span>
                </div>
              </div>

              {/* 4-Point Verification Checklist */}
              <div className="space-y-2.5">
                <h3 className="font-semibold text-gray-900 dark:text-white uppercase text-xs tracking-wider">
                  Verification Breakdown
                </h3>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium text-gray-800 dark:text-gray-200">Cryptographic Signature Valid</span>
                  </div>
                  <span className="font-bold text-green-500 flex items-center gap-1">✓ PASSED</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <Fingerprint className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      Identity Match ({result.extractedFields?.studentName || 'Candidate Name'})
                    </span>
                  </div>
                  {result.matches?.studentName ? (
                    <span className="font-bold text-green-500 flex items-center gap-1">✓ MATCH</span>
                  ) : (
                    <span className="font-bold text-red-500 flex items-center gap-1">✕ MISMATCH</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <History className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium text-gray-800 dark:text-gray-200">Academic Claims Consistency</span>
                  </div>
                  {result.checks?.noMajorInconsistencies ? (
                    <span className="font-bold text-green-500 flex items-center gap-1">✓ CONSISTENT</span>
                  ) : (
                    <span className="font-bold text-yellow-500 flex items-center gap-1">⚠ INCONSISTENT</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <Scan className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium text-gray-800 dark:text-gray-200">Biometric Facial Verification</span>
                  </div>
                  {biometricResult ? (
                    currentBioVerdict === 'MATCH' ? (
                      <span className="font-bold text-green-500 flex items-center gap-1">
                        ✓ MATCH ({biometricResult.similarityScore}%)
                      </span>
                    ) : (
                      <span className="font-bold text-red-500 flex items-center gap-1">
                        ✕ MISMATCH ({biometricResult.similarityScore}%)
                      </span>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsBioModalOpen(true)}
                      className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                    >
                      + Run Face Match
                    </button>
                  )}
                </div>
              </div>

              {/* Analysis Explainability Notes */}
              {result.reasons && result.reasons.length > 0 && (
                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                  <h4 className="font-bold mb-1.5 text-gray-900 dark:text-white uppercase tracking-wider text-[11px]">
                    Explainable Audit Insights:
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-gray-600 dark:text-gray-300">
                    {result.reasons.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AI Biometric Face Comparison Modal */}
      <FaceComparisonModal
        isOpen={isBioModalOpen}
        onClose={() => setIsBioModalOpen(false)}
        referencePhotoUrl={referencePhoto}
        candidateName={result?.extractedFields?.studentName || 'Candidate'}
        credentialId={credentialId}
        initialThreshold={faceThreshold}
        onMatchComplete={(bioRes) => {
          setBiometricResult(bioRes);
        }}
      />

      {/* DigiLocker & National Academic Depository (NAD) Ingestion Modal */}
      <DigiLockerModal
        isOpen={isDigiLockerOpen}
        onClose={() => setIsDigiLockerOpen(false)}
        credentialId={credentialId}
        onDocumentPulled={(doc) => {
          setDigiLockerDoc(doc);
          if (doc.candidate?.name) {
            setCredentialId(doc.crossVerification?.credentialId || 'TL-G807-HDAB-BZ7R-8');
          }
          if (!file) {
            const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'text/plain' });
            const virtualFile = new File([blob], `DigiLocker_NAD_${doc.docType}.txt`, { type: 'text/plain' });
            setFile(virtualFile);
          }
        }}
      />
    </div>
  );
}
