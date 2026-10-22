import { useState } from 'react';
import {
  Layers,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  FileText,
  Download,
  Copy,
  Check,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
  Clock,
} from 'lucide-react';
import { api } from '../../lib/api';

interface BatchItem {
  applicantId?: string;
  candidateName?: string;
  credentialId: string;
}

interface BatchResultItem {
  applicantId: string | null;
  candidateName: string;
  credentialId: string;
  universityName: string;
  degree: string;
  major: string | null;
  gpa: string | null;
  graduationYear: number | null;
  outcome: string;
  isValid: boolean;
  signatureValid: boolean;
  nameMatch: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface BatchSummary {
  total: number;
  valid: number;
  flagged: number;
  failed: number;
  validRate: string;
  durationMs: number;
  batchAuditHash: string;
  verifiedAt: string;
}

const DEMO_BATCH: BatchItem[] = [
  {
    applicantId: 'ATS-2026-001',
    candidateName: 'Tarun Dubey',
    credentialId: 'TL-G807-HDAB-BZ7R-8',
  },
  {
    applicantId: 'ATS-2026-002',
    candidateName: 'Johnathan Archer',
    credentialId: 'TL-G807-HDAB-BZ7R-8', // Name mismatch against Tarun's credential
  },
  {
    applicantId: 'ATS-2026-003',
    candidateName: 'Aarav Sharma',
    credentialId: 'TL-IITB-2025-0012-K',
  },
  {
    applicantId: 'ATS-2026-004',
    candidateName: 'Elena Rostova',
    credentialId: 'TL-FAKE-CRED-9999-X', // Non-existent credential
  },
  {
    applicantId: 'ATS-2026-005',
    candidateName: 'Priya Patel',
    credentialId: 'TL-BITS-2024-8841-A',
  },
];

export function BatchVerification() {
  const [items, setItems] = useState<BatchItem[]>(DEMO_BATCH);
  const [inputText, setInputText] = useState(
    JSON.stringify(DEMO_BATCH, null, 2)
  );
  const [inputMode, setInputMode] = useState<'visual' | 'json' | 'csv'>('visual');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [results, setResults] = useState<BatchResultItem[]>([]);
  const [filterOutcome, setFilterOutcome] = useState<'all' | 'valid' | 'flagged' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadDemoBatch = () => {
    setItems(DEMO_BATCH);
    setInputText(JSON.stringify(DEMO_BATCH, null, 2));
    setErrorMsg('');
  };

  const handleJsonChange = (val: string) => {
    setInputText(val);
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        setItems(parsed);
        setErrorMsg('');
      }
    } catch {
      // Keep typing
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setErrorMsg('CSV must contain a header and at least one candidate row.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const idIdx = headers.findIndex((h) => h.includes('credential') || h.includes('cred'));
      const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('candidate'));
      const appIdx = headers.findIndex((h) => h.includes('applicant') || h.includes('app') || h.includes('id'));

      if (idIdx === -1) {
        setErrorMsg('CSV header must contain a "credential_id" or "credentialId" column.');
        return;
      }

      const parsedItems: BatchItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        const credId = parts[idIdx];
        if (credId) {
          parsedItems.push({
            credentialId: credId,
            candidateName: nameIdx !== -1 ? parts[nameIdx] : undefined,
            applicantId: appIdx !== -1 ? parts[appIdx] : `APP-${100 + i}`,
          });
        }
      }

      setItems(parsedItems);
      setInputText(JSON.stringify(parsedItems, null, 2));
      setInputMode('visual');
      setErrorMsg('');
    };
    reader.readAsText(file);
  };

  const executeBatchVerify = async () => {
    if (!items || items.length === 0) {
      setErrorMsg('Please specify at least one candidate credential to verify.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const resp = await api.post<{
        success: boolean;
        summary: BatchSummary;
        results: BatchResultItem[];
      }>('/employer/batch-verify', { items });

      if (resp.success) {
        setSummary(resp.summary);
        setResults(resp.results);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Batch verification request failed');
    } finally {
      setLoading(false);
    }
  };

  const copyAuditHash = () => {
    if (!summary?.batchAuditHash) return;
    navigator.clipboard.writeText(summary.batchAuditHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const exportCsv = () => {
    if (results.length === 0) return;
    const headers = [
      'Applicant ID',
      'Candidate Name',
      'Credential ID',
      'University',
      'Degree',
      'Outcome',
      'Is Valid',
      'Signature Valid',
      'Name Match',
      'Risk Level',
    ];

    const rows = results.map((r) => [
      r.applicantId || '',
      `"${r.candidateName.replace(/"/g, '""')}"`,
      r.credentialId,
      `"${r.universityName.replace(/"/g, '""')}"`,
      `"${r.degree.replace(/"/g, '""')}"`,
      r.outcome,
      r.isValid ? 'YES' : 'NO',
      r.signatureValid ? 'YES' : 'NO',
      r.nameMatch ? 'YES' : 'NO',
      r.riskLevel,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TrustLink_ATS_Batch_Audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportJson = () => {
    if (!summary || results.length === 0) return;
    const packet = {
      system: 'TrustLink ATS Enterprise Verifier',
      version: '2.0-ECDSA',
      summary,
      results,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(packet, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `TrustLink_Batch_Compliance_${summary.batchAuditHash.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredResults = results.filter((r) => {
    if (filterOutcome === 'valid' && !r.isValid) return false;
    if (filterOutcome === 'flagged' && r.riskLevel !== 'HIGH' && r.outcome !== 'name_mismatch') return false;
    if (filterOutcome === 'failed' && r.outcome !== 'not_found' && r.isValid) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = r.candidateName.toLowerCase().includes(q);
      const matchCred = r.credentialId.toLowerCase().includes(q);
      const matchApp = (r.applicantId || '').toLowerCase().includes(q);
      const matchUni = r.universityName.toLowerCase().includes(q);
      return matchName || matchCred || matchApp || matchUni;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Title & Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 border border-indigo-900/50 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2 border border-indigo-500/30">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              ATS Integration Engine &bull; Bulk Cryptographic Verification
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Enterprise Batch Credential Verification
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Verify hundreds of applicant degrees simultaneously against issuing university
              ECDSA P-256 public keys. Detect credential fraud, name impersonations, and tampered
              academic records in milliseconds.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadDemoBatch}
              className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-indigo-200 hover:text-white rounded-xl text-xs font-semibold border border-indigo-700/50 transition flex items-center gap-2 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Load Demo Batch (5)
            </button>
            <button
              onClick={executeBatchVerify}
              disabled={loading || items.length === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying Batch...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify {items.length} Candidates
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Input Configuration & Staging */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Staged Applicants Queue ({items.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-medium">
              <button
                onClick={() => setInputMode('visual')}
                className={`px-3 py-1 rounded-lg transition ${
                  inputMode === 'visual'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Visual List
              </button>
              <button
                onClick={() => setInputMode('json')}
                className={`px-3 py-1 rounded-lg transition ${
                  inputMode === 'json'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                JSON Payload
              </button>
            </div>

            <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
              <UploadCloud className="w-3.5 h-3.5" />
              Upload CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {inputMode === 'visual' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Applicant ID</th>
                  <th className="pb-3 font-semibold">Candidate Name</th>
                  <th className="pb-3 font-semibold">Credential ID</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {it.applicantId || `APP-${100 + idx}`}
                    </td>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-white">
                      {it.candidateName || <span className="text-slate-400 italic">Unspecified</span>}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                      {it.credentialId}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => {
                          const updated = items.filter((_, i) => i !== idx);
                          setItems(updated);
                          setInputText(JSON.stringify(updated, null, 2));
                        }}
                        className="text-slate-400 hover:text-rose-500 text-xs px-2 py-1 rounded transition"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <textarea
              value={inputText}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={8}
              className="w-full font-mono text-xs p-4 rounded-xl bg-slate-950 text-slate-200 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Paste JSON array with { applicantId, candidateName, credentialId }"
            />
          </div>
        )}
      </div>

      {/* Summary Metrics & Executive Overview */}
      {summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Processed
              </span>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                {summary.total}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Latency: {summary.durationMs}ms
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 shadow-sm">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Verified Valid
              </span>
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {summary.valid}
              </div>
              <div className="text-xs text-emerald-600/80 font-medium mt-1">
                {summary.validRate} Success Rate
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 shadow-sm">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Flagged / Mismatch
              </span>
              <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                {summary.flagged}
              </div>
              <div className="text-xs text-amber-600/80 font-medium mt-1">
                High Risk / Identity Alert
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60 shadow-sm">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                Unregistered / Failed
              </span>
              <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                {summary.failed}
              </div>
              <div className="text-xs text-rose-600/80 font-medium mt-1">
                Registry Not Found
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 shadow-sm">
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                Avg. Verification
              </span>
              <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {(summary.durationMs / summary.total).toFixed(1)}
                <span className="text-sm font-normal text-slate-500">ms</span>
              </div>
              <div className="text-xs text-indigo-600/80 font-medium mt-1">
                Parallel Cryptographic
              </div>
            </div>
          </div>

          {/* Cryptographic Proof & Batch Audit Hash */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Immutable Batch Audit Hash (SHA-256)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CHAIN LOGGED
                </span>
              </div>
              <div className="font-mono text-xs text-slate-300 break-all bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                {summary.batchAuditHash}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={copyAuditHash}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
              >
                {copiedHash ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Proof
                  </>
                )}
              </button>

              <button
                onClick={exportCsv}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>

              <button
                onClick={exportJson}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Compliance JSON
              </button>
            </div>
          </div>

          {/* Verification Results Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Verification Dossier ({filteredResults.length})
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search candidate, ID..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Filter */}
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-medium">
                  <button
                    onClick={() => setFilterOutcome('all')}
                    className={`px-3 py-1 rounded-lg transition ${
                      filterOutcome === 'all'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    All ({results.length})
                  </button>
                  <button
                    onClick={() => setFilterOutcome('valid')}
                    className={`px-3 py-1 rounded-lg transition ${
                      filterOutcome === 'valid'
                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Valid ({summary.valid})
                  </button>
                  <button
                    onClick={() => setFilterOutcome('flagged')}
                    className={`px-3 py-1 rounded-lg transition ${
                      filterOutcome === 'flagged'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Flagged ({summary.flagged})
                  </button>
                  <button
                    onClick={() => setFilterOutcome('failed')}
                    className={`px-3 py-1 rounded-lg transition ${
                      filterOutcome === 'failed'
                        ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Failed ({summary.failed})
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Applicant</th>
                    <th className="pb-3 font-semibold">Verification Verdict</th>
                    <th className="pb-3 font-semibold">Institution & Degree</th>
                    <th className="pb-3 font-semibold">Identity Match</th>
                    <th className="pb-3 font-semibold">Risk Level</th>
                    <th className="pb-3 font-semibold text-right">Cryptography</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredResults.map((res, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {/* Candidate & Applicant ID */}
                      <td className="py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {res.candidateName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {res.applicantId || 'N/A'} &bull; {res.credentialId}
                        </div>
                      </td>

                      {/* Verdict Badge */}
                      <td className="py-3">
                        {res.isValid ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            VERIFIED VALID
                          </span>
                        ) : res.outcome === 'name_mismatch' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            NAME MISMATCH
                          </span>
                        ) : res.outcome === 'revoked' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            REVOKED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            NOT FOUND
                          </span>
                        )}
                      </td>

                      {/* Institution & Degree */}
                      <td className="py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {res.universityName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {res.degree} {res.major ? `(${res.major})` : ''} {res.gpa ? `• GPA: ${res.gpa}` : ''}
                        </div>
                      </td>

                      {/* Name Match Indicator */}
                      <td className="py-3">
                        {res.nameMatch ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <Check className="w-3.5 h-3.5" />
                            Exact Match
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Discrepancy
                          </span>
                        )}
                      </td>

                      {/* Risk Level */}
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                            res.riskLevel === 'LOW'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : res.riskLevel === 'MEDIUM'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {res.riskLevel} RISK
                        </span>
                      </td>

                      {/* Cryptography Signature */}
                      <td className="py-3 text-right">
                        {res.signatureValid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            ECDSA P-256
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-400">
                            Unsigned / N/A
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
