import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

interface Student {
  id: number;
  student_number: string;
  full_name: string;
  email: string;
  credentials_count: number;
  created_at: string;
}

interface Template {
  id: number;
  name: string;
  type: string;
  claimSchema: Record<string, string>;
  employerVisibleClaims: string[];
}

interface Credential {
  id: number;
  credential_id: string;
  student_name: string;
  student_number: string;
  template_name: string;
  credential_type: string;
  status: 'active' | 'valid' | 'suspended' | 'revoked' | 'expired';
  issued_at: string;
}

interface StatusHistoryRecord {
  id: number;
  credential_id: string;
  old_status: string;
  new_status: string;
  reason: string;
  changed_by: string;
  created_at: string;
}

type Tab = 'students' | 'templates' | 'credentials';

const TEMPLATE_PRESETS: Record<string, { schema: Record<string, string>; visible: string[] }> = {
  degree: {
    schema: { studentName: 'string', degree: 'string', major: 'string', graduationYear: 'string', gpa: 'string' },
    visible: ['studentName', 'degree', 'major', 'graduationYear'],
  },
  transcript: {
    schema: { studentName: 'string', studentNumber: 'string', program: 'string', semesterGpa: 'string', cumulativeGpa: 'string', creditsCompleted: 'string' },
    visible: ['studentName', 'studentNumber', 'program', 'cumulativeGpa'],
  },
  certificate: {
    schema: { studentName: 'string', courseName: 'string', grade: 'string', completionDate: 'string', instructor: 'string' },
    visible: ['studentName', 'courseName', 'completionDate'],
  },
  skill: {
    schema: { studentName: 'string', skillName: 'string', competencyLevel: 'string', assessmentScore: 'string', verifiedDate: 'string' },
    visible: ['studentName', 'skillName', 'competencyLevel', 'verifiedDate'],
  },
  certification: {
    schema: { studentName: 'string', certificationTitle: 'string', credentialNumber: 'string', issueDate: 'string', expiryDate: 'string' },
    visible: ['studentName', 'certificationTitle', 'issueDate'],
  },
  internship: {
    schema: { studentName: 'string', companyName: 'string', role: 'string', durationMonths: 'string', performanceRating: 'string' },
    visible: ['studentName', 'companyName', 'role', 'durationMonths'],
  },
  'micro-credential': {
    schema: { studentName: 'string', badgeName: 'string', issuingBody: 'string', criteriaMet: 'string', issuanceDate: 'string' },
    visible: ['studentName', 'badgeName', 'issuingBody', 'issuanceDate'],
  },
  project: {
    schema: { studentName: 'string', projectTitle: 'string', techStack: 'string', projectRole: 'string', score: 'string' },
    visible: ['studentName', 'projectTitle', 'techStack', 'projectRole'],
  },
  achievement: {
    schema: { studentName: 'string', awardTitle: 'string', competition: 'string', rank: 'string', dateAwarded: 'string' },
    visible: ['studentName', 'awardTitle', 'competition', 'dateAwarded'],
  },
};

export function UniversityDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Enroll student form
  const [enrollForm, setEnrollForm] = useState({ studentNumber: '', fullName: '', email: '' });
  const [enrolling, setEnrolling] = useState(false);
  const [inviteToken, setInviteToken] = useState('');

  // Issue credential form
  const [issueForm, setIssueForm] = useState({
    studentId: '',
    templateId: '',
    claims: '{}',
    expiresAt: '',
  });
  const [issuing, setIssuing] = useState(false);

  // Template creation form (Supports 9 credential types)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    type: 'degree',
    claimSchemaRaw: JSON.stringify(TEMPLATE_PRESETS.degree.schema, null, 2),
    employerVisibleClaimsRaw: JSON.stringify(TEMPLATE_PRESETS.degree.visible),
  });
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // Lifecycle Modals: Suspend modal and History modal
  const [suspendModalCred, setSuspendModalCred] = useState<Credential | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);

  const [historyModalCred, setHistoryModalCred] = useState<Credential | null>(null);
  const [historyList, setHistoryList] = useState<StatusHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, tRes, cRes] = await Promise.all([
        api.get<{ students: Student[] }>('/university/students'),
        api.get<{ templates: Template[] }>('/university/templates'),
        api.get<{ credentials: Credential[] }>('/university/credentials'),
      ]);
      setStudents(sRes.students);
      setTemplates(tRes.templates);
      setCredentials(cRes.credentials);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'university') { navigate('/login'); return; }
    loadData();
  }, [user, navigate, loadData]);

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const enrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrolling(true);
    setError('');
    try {
      const res = await api.post<{ studentId: number; inviteToken: string }>('/university/students', enrollForm);
      setInviteToken(res.inviteToken);
      showMsg(`Student enrolled! Invite token generated.`);
      setEnrollForm({ studentNumber: '', fullName: '', email: '' });
      loadData();
    } catch (e: any) { setError(e.message); }
    finally { setEnrolling(false); }
  };

  const onTemplateTypeSelect = (selectedType: string) => {
    const preset = TEMPLATE_PRESETS[selectedType] || TEMPLATE_PRESETS.degree;
    setTemplateForm((f) => ({
      ...f,
      type: selectedType,
      claimSchemaRaw: JSON.stringify(preset.schema, null, 2),
      employerVisibleClaimsRaw: JSON.stringify(preset.visible),
    }));
  };

  const createTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTemplate(true);
    setError('');
    try {
      JSON.parse(templateForm.claimSchemaRaw);
      JSON.parse(templateForm.employerVisibleClaimsRaw);
      await api.post('/university/templates', {
        name: templateForm.name,
        type: templateForm.type,
        claimSchema: JSON.parse(templateForm.claimSchemaRaw),
        employerVisibleClaims: JSON.parse(templateForm.employerVisibleClaimsRaw),
      });
      showMsg('Template created successfully!');
      setTemplateForm({
        name: '',
        type: 'degree',
        claimSchemaRaw: JSON.stringify(TEMPLATE_PRESETS.degree.schema, null, 2),
        employerVisibleClaimsRaw: JSON.stringify(TEMPLATE_PRESETS.degree.visible),
      });
      loadData();
    } catch (e: any) { setError(e.message); }
    finally { setCreatingTemplate(false); }
  };

  const issueCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssuing(true);
    setError('');
    try {
      let claims: Record<string, unknown>;
      try { claims = JSON.parse(issueForm.claims); } catch { throw new Error('Claims must be valid JSON'); }

      const res = await api.post<{ credentialId: string }>('/university/credentials', {
        studentId: Number(issueForm.studentId),
        templateId: Number(issueForm.templateId),
        claims,
        expiresAt: issueForm.expiresAt || null,
      });
      showMsg(`Credential issued & cryptographically signed! ID: ${res.credentialId}`);
      setIssueForm({ studentId: '', templateId: '', claims: '{}', expiresAt: '' });
      loadData();
    } catch (e: any) { setError(e.message); }
    finally { setIssuing(false); }
  };

  // Credential lifecycle management (Feature 2)
  const handleSuspend = async () => {
    if (!suspendModalCred) return;
    setSuspending(true);
    try {
      await api.post(`/university/credentials/${suspendModalCred.credential_id}/suspend`, {
        reason: suspendReason || 'Administrative suspension by institution',
      });
      showMsg(`Credential ${suspendModalCred.credential_id} SUSPENDED.`);
      setSuspendModalCred(null);
      setSuspendReason('');
      loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSuspending(false);
    }
  };

  const handleRestore = async (credentialId: string) => {
    if (!confirm('Restore this credential to VALID status?')) return;
    try {
      await api.post(`/university/credentials/${credentialId}/restore`, {
        reason: 'Restored to valid status following administrative clearance',
      });
      showMsg(`Credential ${credentialId} RESTORED to VALID.`);
      loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    if (!confirm('PERMANENTLY REVOKE this credential? This action cannot be undone.')) return;
    try {
      await api.post(`/university/credentials/${credentialId}/revoke`, {
        reason: 'Revoked via university authority console',
      });
      showMsg(`Credential ${credentialId} permanently REVOKED.`);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const openHistoryModal = async (cred: Credential) => {
    setHistoryModalCred(cred);
    setLoadingHistory(true);
    setHistoryList([]);
    try {
      const res = await api.get<{ history: StatusHistoryRecord[] }>(`/university/credentials/${cred.credential_id}/history`);
      setHistoryList(res.history || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Auto-fill claims JSON when template changes
  const onTemplateChange = (tid: string) => {
    const t = templates.find((t) => String(t.id) === tid);
    if (t) {
      const sample: Record<string, string> = {};
      for (const key of Object.keys(t.claimSchema)) sample[key] = '';
      setIssueForm((f) => ({ ...f, templateId: tid, claims: JSON.stringify(sample, null, 2) }));
    } else {
      setIssueForm((f) => ({ ...f, templateId: tid }));
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'active' || s === 'valid') {
      return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">✓ VALID</span>;
    }
    if (s === 'suspended') {
      return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">⚠ SUSPENDED</span>;
    }
    if (s === 'revoked') {
      return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">✕ REVOKED</span>;
    }
    return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">{status}</span>;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070F20]">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent" />
    </div>
  );

  const TAB_CLASSES = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${tab === t
      ? 'bg-indigo-600 text-white'
      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070F20]">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">TL</span>
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 dark:text-white">TrustLink</h1>
            <p className="text-xs text-slate-500">University Portal &amp; Authorized Issuer</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">{user?.email}</span>
          <button id="uni-logout" onClick={() => logout().then(() => navigate('/login'))}
            className="text-sm text-red-500 hover:text-red-700 font-medium">Logout</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Notifications */}
        {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex justify-between">{error} <button onClick={() => setError('')}>✕</button></div>}
        {success && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700 text-sm flex justify-between">{success} <button onClick={() => setSuccess('')}>✕</button></div>}
        {inviteToken && (
          <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-indigo-800 font-semibold text-sm mb-1">🔗 Invite Link Generated</p>
            <p className="text-xs font-mono break-all text-indigo-700">{`${window.location.origin}/claim?token=${inviteToken}`}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/claim?token=${inviteToken}`)}
                className="text-xs py-1 px-3 bg-indigo-600 text-white rounded hover:bg-indigo-700">Copy</button>
              <button onClick={() => setInviteToken('')} className="text-xs py-1 px-3 border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50">Dismiss</button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Students', value: students.length, color: 'text-indigo-600' },
            { label: 'Templates', value: templates.length, color: 'text-emerald-600' },
            { label: 'Credentials', value: credentials.length, color: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button id="tab-students" className={TAB_CLASSES('students')} onClick={() => setTab('students')}>Students</button>
          <button id="tab-templates" className={TAB_CLASSES('templates')} onClick={() => setTab('templates')}>Templates &amp; Types</button>
          <button id="tab-credentials" className={TAB_CLASSES('credentials')} onClick={() => setTab('credentials')}>Issued Credentials &amp; Lifecycle</button>
        </div>

        {/* Students Tab */}
        {tab === 'students' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Enroll New Student</h2>
              <form onSubmit={enrollStudent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student Number</label>
                  <input id="student-number" required value={enrollForm.studentNumber}
                    onChange={(e) => setEnrollForm((f) => ({ ...f, studentNumber: e.target.value }))}
                    placeholder="24BAI1523" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input id="student-full-name" required value={enrollForm.fullName}
                    onChange={(e) => setEnrollForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="Tarun Dubey" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input id="student-email" required type="email" value={enrollForm.email}
                    onChange={(e) => setEnrollForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="student@university.edu" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
                <button id="enroll-student-btn" type="submit" disabled={enrolling}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition">
                  {enrolling ? 'Enrolling…' : 'Enroll Student'}
                </button>
              </form>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Enrolled Students ({students.length})</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {students.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No students enrolled yet.</p>
                ) : students.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{s.student_number} · {s.email}</p>
                    </div>
                    <span className="text-xs text-slate-400">{s.credentials_count} cred(s)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Templates Tab (Supports 9 credential types - Feature 9) */}
        {tab === 'templates' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Create Credential Template</h2>
              <p className="text-xs text-slate-500 mb-4">
                Support Degrees, Transcripts, Skills, Micro-Credentials, Certifications, and Internships.
              </p>
              <form onSubmit={createTemplate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Template Name</label>
                  <input id="template-name" required value={templateForm.name}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Master of Science or Cloud Architecture Micro-Credential"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Credential Type</label>
                  <select id="template-type" value={templateForm.type}
                    onChange={(e) => onTemplateTypeSelect(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    <option value="degree">Degree</option>
                    <option value="transcript">Transcript</option>
                    <option value="certificate">Course Certificate</option>
                    <option value="skill">Skill</option>
                    <option value="certification">Certification</option>
                    <option value="internship">Internship</option>
                    <option value="micro-credential">Micro-Credential</option>
                    <option value="project">Project</option>
                    <option value="achievement">Achievement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Claim Schema (JSON)</label>
                  <textarea rows={5} value={templateForm.claimSchemaRaw}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, claimSchemaRaw: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Employer Visible Claims (JSON array)</label>
                  <input value={templateForm.employerVisibleClaimsRaw}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, employerVisibleClaimsRaw: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
                <button id="create-template-btn" type="submit" disabled={creatingTemplate}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition">
                  {creatingTemplate ? 'Creating…' : 'Create Template'}
                </button>
              </form>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Templates ({templates.length})</h2>
              <div className="space-y-3">
                {templates.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No templates yet.</p>
                ) : templates.map((t) => (
                  <div key={t.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.name}</p>
                      <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full uppercase">{t.type}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{Object.keys(t.claimSchema).length} claims · {t.employerVisibleClaims.length} employer-visible</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Credentials Tab (Issue + Lifecycle Management - Feature 2) */}
        {tab === 'credentials' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Issue Credential</h2>
              {templates.length === 0 || students.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">Please create at least one template and enroll at least one student first.</p>
                </div>
              ) : (
                <form onSubmit={issueCredential} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student</label>
                    <select id="issue-student" required value={issueForm.studentId}
                      onChange={(e) => setIssueForm((f) => ({ ...f, studentId: e.target.value }))}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                      <option value="">Select student…</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.student_number})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Template</label>
                    <select id="issue-template" required value={issueForm.templateId}
                      onChange={(e) => onTemplateChange(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                      <option value="">Select template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Claims (JSON)</label>
                    <textarea id="issue-claims" rows={6} required value={issueForm.claims}
                      onChange={(e) => setIssueForm((f) => ({ ...f, claims: e.target.value }))}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Expires At (optional)</label>
                    <input type="date" value={issueForm.expiresAt}
                      onChange={(e) => setIssueForm((f) => ({ ...f, expiresAt: e.target.value }))}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                  </div>
                  <button id="issue-credential-btn" type="submit" disabled={issuing}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition">
                    {issuing ? 'Issuing & Signing…' : '🎓 Issue Signed Credential'}
                  </button>
                </form>
              )}
            </div>

            {/* Issued Credentials with Lifecycle Management (Suspend, Revoke, Restore, History) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Issued Credentials ({credentials.length})
                </h2>
                <span className="text-xs text-slate-500">Lifecycle Management</span>
              </div>

              <div className="space-y-3 max-h-[520px] overflow-y-auto">
                {credentials.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No credentials issued yet.</p>
                ) : credentials.map((c) => {
                  const isActive = c.status === 'active' || c.status === 'valid';
                  const isSuspended = c.status === 'suspended';
                  const isRevoked = c.status === 'revoked';

                  return (
                    <div key={c.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.student_name}</p>
                          <p className="text-xs text-slate-500">{c.template_name} • {new Date(c.issued_at).toLocaleDateString()}</p>
                          <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">{c.credential_id}</p>
                        </div>
                        <div className="shrink-0">{getStatusBadge(c.status)}</div>
                      </div>

                      {/* Actions toolbar */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-600/50">
                        <a href={`/verify/credential/${c.credential_id}`} target="_blank" rel="noreferrer"
                          className="text-xs py-1 px-2.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded font-semibold hover:bg-slate-300 transition">
                          Verify
                        </a>

                        <a href={`/api/credentials/${c.credential_id}/certificate.pdf`} target="_blank" rel="noreferrer"
                          className="text-xs py-1 px-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded font-semibold hover:bg-indigo-100 transition">
                          PDF Certificate
                        </a>

                        {isActive && (
                          <button
                            onClick={() => { setSuspendModalCred(c); setSuspendReason(''); }}
                            className="text-xs py-1 px-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded font-semibold hover:bg-amber-100 transition"
                          >
                            Suspend
                          </button>
                        )}

                        {isSuspended && (
                          <button
                            onClick={() => handleRestore(c.credential_id)}
                            className="text-xs py-1 px-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded font-semibold hover:bg-emerald-100 transition"
                          >
                            Restore
                          </button>
                        )}

                        {!isRevoked && (
                          <button
                            onClick={() => handleRevoke(c.credential_id)}
                            className="text-xs py-1 px-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 rounded font-semibold hover:bg-red-100 transition"
                          >
                            Revoke
                          </button>
                        )}

                        <button
                          onClick={() => openHistoryModal(c)}
                          className="text-xs py-1 px-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 ml-auto"
                        >
                          History
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Suspend Reason Modal */}
      {suspendModalCred && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Suspend Credential: {suspendModalCred.credential_id}
            </h3>
            <p className="text-xs text-slate-500">
              Suspended credentials will immediately show as <strong>⚠ CREDENTIAL SUSPENDED</strong> on verification portals.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Suspension Reason</label>
              <textarea
                rows={3}
                required
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Administrative hold pending disciplinary review"
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSuspend}
                disabled={suspending || !suspendReason.trim()}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {suspending ? 'Suspending…' : 'Confirm Suspension'}
              </button>
              <button
                onClick={() => setSuspendModalCred(null)}
                className="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status History Modal */}
      {historyModalCred && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lifecycle Audit History
                </h3>
                <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                  {historyModalCred.credential_id}
                </p>
              </div>
              <button onClick={() => setHistoryModalCred(null)} className="text-slate-400 font-bold">✕</button>
            </div>

            {loadingHistory ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading audit records…</p>
            ) : historyList.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No status transitions recorded yet (remains in initial state).</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {historyList.map((h) => (
                  <div key={h.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{h.old_status.toUpperCase()} ➔ {h.new_status.toUpperCase()}</span>
                      <span className="text-[10px] text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">Reason: {h.reason}</p>
                    <p className="text-[10px] text-slate-400 font-mono">By: {h.changed_by}</p>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setHistoryModalCred(null)}
              className="w-full py-2 border rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
