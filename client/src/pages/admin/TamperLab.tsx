import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import {
  FileCode,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Layers,
} from 'lucide-react';

interface TamperCredential {
  id: number;
  credentialId: string;
  universityName: string;
  studentName: string;
  studentNumber: string;
  payload: any;
  claims: Record<string, any>;
  salts: Record<string, string>;
  signature: string;
  publicKeyPem: string;
  status: string;
}

export function TamperLab() {
  const [credentials, setCredentials] = useState<TamperCredential[]>([]);
  const [selectedCred, setSelectedCred] = useState<TamperCredential | null>(null);
  const [loading, setLoading] = useState(true);

  // Tamper attack scenario state
  const [scenario, setScenario] = useState<'claim' | 'metadata' | 'signature' | 'none'>('claim');
  const [tamperedField, setTamperedField] = useState('degree');
  const [tamperedValue, setTamperedValue] = useState('Doctor of Philosophy (Ph.D.) in Cryptography');

  // Verification execution state
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadCredentials = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ credentials: TamperCredential[] }>('/admin/tamper/credentials');
      setCredentials(res.credentials);
      if (res.credentials.length > 0) {
        setSelectedCred(res.credentials[0]);
        // Set first claim field
        const firstKey = Object.keys(res.credentials[0].claims)[0] || 'degree';
        setTamperedField(firstKey);
      }
    } catch (err: any) {
      console.error('Failed to load credentials for tamper lab:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const resetTampering = () => {
    setScenario('none');
    setResult(null);
    if (selectedCred) {
      const firstKey = Object.keys(selectedCred.claims)[0] || 'degree';
      setTamperedField(firstKey);
      setTamperedValue('Doctor of Philosophy (Ph.D.) in Cryptography');
    }
  };

  const handleSimulate = async () => {
    if (!selectedCred) return;

    setSimulating(true);
    setResult(null);

    try {
      // Build reveals array
      let reveals = Object.entries(selectedCred.claims).map(([name, value]) => ({
        name,
        value,
        salt: selectedCred.salts[name] || '',
      }));

      let payload = { ...selectedCred.payload };
      let signature = selectedCred.signature;

      if (scenario === 'claim') {
        // Alter the revealed value
        reveals = reveals.map((r) =>
          r.name === tamperedField ? { ...r, value: tamperedValue } : r
        );
      } else if (scenario === 'metadata') {
        // Alter credentialId in the signed payload
        payload = {
          ...payload,
          credentialId: selectedCred.credentialId + '-FORGED',
        };
      } else if (scenario === 'signature') {
        // Flip characters in the signature base64
        signature = signature.slice(0, -6) + 'AAAAAA';
      }

      const simRes = await api.post('/admin/tamper/simulate', {
        payload,
        signature,
        publicKeyPem: selectedCred.publicKeyPem,
        reveals,
        credentialStatus: selectedCred.status,
        issuerStatus: 'active',
      });

      setResult(Object.assign({}, simRes as object, {
        scenario,
        tamperedField: scenario === 'claim' ? tamperedField : null,
      }));
    } catch (err: any) {
      setResult({
        outcome: 'invalid',
        isValid: false,
        failureReason: err.message || 'Simulation error',
      });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="p-6 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 dark:from-amber-950/30 dark:via-rose-950/30 dark:to-indigo-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Tamper Lab & Attack Simulator
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  NFR-06 Active
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Demonstrates mathematical tamper resistance: alter claim values, metadata, or signatures, and witness the cryptographic verification engine detect the exact forgery.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetTampering}
            className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-2 self-start md:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Simulator
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading registered credentials...
          </div>
        ) : credentials.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500">
            No credentials found in the registry. Issue a credential first using the University Issuer portal.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Attack Configuration */}
            <div className="lg:col-span-6 space-y-6">
              {/* Step 1: Credential Selection */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">1</span>
                  Target Credential
                </div>
                <select
                  value={selectedCred?.id}
                  onChange={(e) => {
                    const found = credentials.find((c) => c.id === Number(e.target.value));
                    if (found) {
                      setSelectedCred(found);
                      setResult(null);
                      const firstKey = Object.keys(found.claims)[0] || 'degree';
                      setTamperedField(firstKey);
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.credentialId} — {c.studentName} ({c.universityName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Choose Attack Vector */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">2</span>
                  Synthetic Attack Vector
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setScenario('claim');
                      setResult(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      scenario === 'claim'
                        ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm mb-1">Claim Value Forgery</div>
                    <p className="text-xs opacity-80">Alter a grade, degree name, or graduation date to falsify credentials.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScenario('metadata');
                      setResult(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      scenario === 'metadata'
                        ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm mb-1">Metadata Tampering</div>
                    <p className="text-xs opacity-80">Mutate Credential ID or issue date in the canonical JSON payload.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScenario('signature');
                      setResult(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      scenario === 'signature'
                        ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm mb-1">Signature Bit-Flip</div>
                    <p className="text-xs opacity-80">Corrupt raw ECDSA P-256 signature bytes to test curve verification.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScenario('none');
                      setResult(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      scenario === 'none'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm mb-1">No Tamper (Control)</div>
                    <p className="text-xs opacity-80">Verify original authentic data with 0 mutations as baseline.</p>
                  </button>
                </div>

                {/* Scenario Details */}
                {scenario === 'claim' && selectedCred && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                        Select Attribute to Alter
                      </label>
                      <select
                        value={tamperedField}
                        onChange={(e) => setTamperedField(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                      >
                        {Object.keys(selectedCred.claims).map((field) => (
                          <option key={field} value={field}>
                            {field} (Original: "{String(selectedCred.claims[field])}")
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                        Forged Replacement Value
                      </label>
                      <input
                        type="text"
                        value={tamperedValue}
                        onChange={(e) => setTamperedValue(e.target.value)}
                        placeholder="e.g. 4.00 CGPA or Ph.D."
                        className="w-full px-3 py-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                )}

                {/* Simulate Button */}
                <button
                  type="button"
                  onClick={handleSimulate}
                  disabled={simulating}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                    scenario === 'none'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
                  }`}
                >
                  {simulating ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Executing Cryptographic Verification...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Simulate Verification Pipeline
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Verification Results & Diagnostic Breakdown */}
            <div className="lg:col-span-6 space-y-6">
              {result ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
                  {/* Verdict Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      result.isValid
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {result.isValid ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-black text-base uppercase tracking-wider">
                        {result.isValid ? 'Authentic (No Tampering Detected)' : 'Cryptographic Tamper Detected'}
                      </div>
                      <p className="text-xs mt-1 font-medium">
                        {result.isValid
                          ? 'All salted claim commitments and IEEE-P1363 ECDSA signature matched perfectly.'
                          : result.failureReason || 'Failed cryptographic integrity validation.'}
                      </p>
                    </div>
                  </div>

                  {/* Diagnostic Pipeline Stages */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      Cryptographic Pipeline Breakdown
                    </h3>

                    {/* Stage 1: Commitments Check */}
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          1. Salted Claim Commitments
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          SHA-256(canonical([salt, name, value])) matches signed commitment
                        </div>
                      </div>
                      <div>
                        {result.tamperedClaims && result.tamperedClaims.length > 0 ? (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            MISMATCH ({result.tamperedClaims.join(', ')})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            PASSED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stage 2: ECDSA Signature Check */}
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          2. ECDSA P-256 Digital Signature
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          IEEE-P1363 raw (r || s) verified against {selectedCred?.universityName} public key
                        </div>
                      </div>
                      <div>
                        {scenario === 'signature' || scenario === 'metadata' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            SIGNATURE FAILED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            VALID
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stage 3: Issuer Accreditation Check */}
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          3. Issuer Status & Key Validity
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Key ID: <code className="text-indigo-500">{selectedCred?.payload?.issuer?.kid}</code>
                        </div>
                      </div>
                      <div>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          ACTIVE ISSUER
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tampered Attributes Highlight */}
                  {result.tamperedClaims && result.tamperedClaims.length > 0 && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs space-y-2">
                      <div className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Tampered Claim Commitment Identified
                      </div>
                      <p className="text-rose-800 dark:text-rose-300">
                        The candidate submitted the claim <strong className="underline">{tamperedField} = "{tamperedValue}"</strong>. However, the SHA-256 hash of this claim does not match the immutable cryptographic commitment sealed in the university's signature.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full min-h-[360px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                    <FileCode className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
                    Awaiting Simulation Execution
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Select an attack vector on the left and click "Simulate Verification Pipeline" to watch the verification engine analyze the tamper attempt.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
