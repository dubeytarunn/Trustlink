import { useState, useEffect } from 'react';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import { History, ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, Lock } from 'lucide-react';

interface AuditEntry {
  id: number;
  seq: number;
  actor_user_id: number | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
  prev_hash: string;
  entry_hash: string;
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<{
    isValid: boolean;
    totalVerified: number;
    reason?: string;
  } | null>(null);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ entries: AuditEntry[] }>('/admin/audit-log');
      setEntries(data.entries || []);
    } catch (err: any) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    setIntegrityResult(null);
    try {
      const data = await api.get<any>('/admin/audit-log/integrity');
      setIntegrityResult(data);
    } catch (err: any) {
      setIntegrityResult({ isValid: false, totalVerified: 0, reason: err.message || 'Failed to execute cryptographic verification check' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Integrity Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2.5">
              <History className="w-7 h-7 text-emerald-500" />
              Tamper-Evident Audit Log
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Append-only cryptographic log chained via SHA-256 for all privileged administrative operations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyIntegrity}
              disabled={verifying}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {verifying ? 'Verifying Chain...' : 'Verify Log Integrity'}
            </button>
            <button
              onClick={fetchAuditLogs}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Log"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Integrity Verification Card */}
        {integrityResult && (
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              integrityResult.isValid
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
            }`}
          >
            {integrityResult.isValid ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {integrityResult.isValid
                  ? 'Audit Log Cryptographic Integrity Verified'
                  : 'Chain Tampering Detected!'}
              </div>
              <div className="text-xs mt-0.5 opacity-90">
                {integrityResult.isValid
                  ? `All ${integrityResult.totalVerified} sequential records verified successfully against their SHA-256 parent hash links. No tampering detected.`
                  : `Integrity check failed: ${integrityResult.reason}`}
              </div>
            </div>
          </div>
        )}

        {/* Audit Log Table */}
        <div className="bg-white dark:bg-[#0B1B3A] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Seq</th>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Entity</th>
                  <th className="py-3.5 px-6">Entry Hash (SHA-256)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Loading audit records...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No audit records found.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.seq} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-500">
                        #{entry.seq}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono">
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300">
                        {entry.actor_email || 'System / Initializer'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {entry.entity_type}:{entry.entity_id}
                      </td>
                      <td className="py-3.5 px-6 font-mono text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          <span className="truncate max-w-[180px]">{entry.entry_hash}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
