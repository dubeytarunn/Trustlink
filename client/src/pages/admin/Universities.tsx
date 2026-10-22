import React, { useState, useEffect } from 'react';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import {
  Building2,
  Plus,
  KeyRound,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Ban,
  Play,
  X,
} from 'lucide-react';

interface University {
  id: number;
  name: string;
  domain: string;
  country: string;
  registrar_email: string;
  status: 'active' | 'suspended';
  active_kid: string;
  credentials_issued_count: number;
  students_count: number;
  public_jwk?: {
    kid: string;
    crv: string;
    kty: string;
    x: string;
    y: string;
  } | null;
}

export function Universities() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // New University Form State
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    country: '',
    registrarEmail: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [onboardedResult, setOnboardedResult] = useState<any>(null);

  const fetchUniversities = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ universities: University[] }>('/admin/universities');
      setUniversities(data.universities || []);
    } catch (err: any) {
      console.warn('Failed to load universities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUniversities();
  }, []);

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    try {
      const data = await api.post<any>('/admin/universities', formData);
      setOnboardedResult(data);
      fetchUniversities();
    } catch (err: any) {
      setFormError(err.message || 'Error onboarding university');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRotateKey = async (uniId: number, name: string) => {
    if (!confirm(`Are you sure you want to rotate the cryptographic signing key for ${name}? The old key will remain valid for verifying existing credentials.`)) {
      return;
    }

    try {
      const data = await api.post<any>(`/admin/universities/${uniId}/rotate-key`);
      alert(`Success: ${data.message} (New Key: ${data.key?.kid})`);
      fetchUniversities();
    } catch (err: any) {
      alert(`Error: ${err.message || 'Key rotation failed'}`);
    }
  };

  const handleToggleSuspend = async (uni: University) => {
    const isSuspending = uni.status === 'active';
    const actionText = isSuspending ? 'suspend' : 'reactivate';
    if (!confirm(`Are you sure you want to ${actionText} ${uni.name}?`)) return;

    try {
      const endpoint = isSuspending ? `/admin/universities/${uni.id}/suspend` : `/admin/universities/${uni.id}/reactivate`;
      await api.post(endpoint);
      fetchUniversities();
    } catch (err: any) {
      alert(`Error while attempting to ${actionText} university: ${err.message}`);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2.5">
              <Building2 className="w-7 h-7 text-emerald-500" />
              Onboarded Universities
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Institutions authorized to issue ECDSA digitally signed academic credentials
            </p>
          </div>

          <button
            onClick={() => {
              setIsModalOpen(true);
              setOnboardedResult(null);
              setFormError(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-md shadow-emerald-500/20 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Onboard Institution
          </button>
        </div>

        {/* Universities Data Table */}
        <div className="bg-white dark:bg-[#0B1B3A] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-6">Institution</th>
                  <th className="py-3.5 px-4">Domain &amp; Country</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Active Key ID (ECDSA)</th>
                  <th className="py-3.5 px-4">Issued Credentials</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Loading universities...
                    </td>
                  </tr>
                ) : universities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No institutions onboarded yet. Click "Onboard Institution" to get started.
                    </td>
                  </tr>
                ) : (
                  universities.map((uni) => (
                    <tr key={uni.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-6 font-medium text-slate-900 dark:text-white">
                        <div className="font-semibold text-slate-900 dark:text-white">{uni.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{uni.registrar_email}</div>
                      </td>
                      <td className="py-4 px-4 text-slate-600 dark:text-slate-300">
                        <div className="font-mono text-xs">{uni.domain}</div>
                        <div className="text-xs text-slate-400">{uni.country}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            uni.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              uni.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          {uni.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{uni.active_kid || 'No key'}</span>
                          {uni.active_kid && (
                            <button
                              onClick={() => copyToClipboard(uni.active_kid, String(uni.id))}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Copy Key ID"
                            >
                              {copiedKeyId === String(uni.id) ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        {uni.credentials_issued_count || 0}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleRotateKey(uni.id, uni.name)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors"
                          title="Rotate cryptographic keypair"
                        >
                          <RotateCcw className="w-3 h-3 text-indigo-500" />
                          Rotate Key
                        </button>
                        <button
                          onClick={() => handleToggleSuspend(uni)}
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border font-medium transition-colors ${
                            uni.status === 'active'
                              ? 'border-red-200 dark:border-red-900/60 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                              : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                          }`}
                        >
                          {uni.status === 'active' ? (
                            <>
                              <Ban className="w-3 h-3" />
                              Suspend
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3" />
                              Reactivate
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Onboard University Form */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#0B1B3A] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-500" />
                  Onboard New Academic Institution (FR-01)
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {onboardedResult ? (
                <div className="mt-4 space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
                      <CheckCircle2 className="w-5 h-5" />
                      Institution Onboarded &amp; ECDSA Key Generated!
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      The institution was successfully registered. An ECDSA P-256 keypair has been generated. The private key has been encrypted at rest with AES-256-GCM.
                    </p>
                  </div>

                  <div className="space-y-2 text-xs font-mono bg-slate-50 dark:bg-slate-900/80 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-500">Institution ID: </span>
                      <span className="text-slate-900 dark:text-white font-semibold">
                        {onboardedResult.university.id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Key ID (kid): </span>
                      <span className="text-emerald-500 font-semibold">{onboardedResult.key.kid}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">SHA-256 Fingerprint: </span>
                      <span className="text-slate-700 dark:text-slate-300 truncate block">
                        {onboardedResult.key.fingerprint}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                      <span>Security Verification: Private key is securely encrypted at rest and never exposed.</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setOnboardedResult(null);
                    }}
                    className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-all"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleOnboardSubmit} className="mt-4 space-y-4">
                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                        Institution Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Stanford University"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                        Official Domain *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. stanford.edu"
                        value={formData.domain}
                        onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                        Country *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. United States"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                        Registrar Email *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="registrar@institution.edu"
                        value={formData.registrarEmail}
                        onChange={(e) => setFormData({ ...formData, registrarEmail: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-3">
                      University Administrator Credentials
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Admin Email *
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="admin@institution.edu"
                          value={formData.adminEmail}
                          onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Admin Password *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="Min 8 characters"
                          value={formData.adminPassword}
                          onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className="px-5 py-2 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {formSubmitting ? 'Generating Keys & Onboarding...' : 'Generate Keys & Onboard'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
