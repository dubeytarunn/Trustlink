import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight, Lock, Mail } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Admin',            email: 'admin@trustlink.demo',     pass: 'DemoAdmin123!' },
  { label: 'University',       email: 'uni@northbridge.demo',     pass: 'DemoUni123!' },
  { label: 'Student',          email: 'student@northbridge.demo', pass: 'DemoStudent123!' },
  { label: 'Employer',         email: 'hr@acme-corp.demo',        pass: 'DemoEmployer123!' },
];

export function Login() {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Login failed');
      login(data.user, data.accessToken);
      const paths: Record<string,string> = { admin:'/admin/universities', university:'/university', student:'/student', employer:'/employer' };
      navigate(paths[data.user.role] ?? '/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  };

  const fill = (e: string, p: string) => { setEmail(e); setPassword(p); setError(null); };

  const hov = (enter: Partial<CSSStyleDeclaration>, leave: Partial<CSSStyleDeclaration>) => ({
    onMouseEnter: (ev: React.MouseEvent<HTMLElement>) => Object.assign((ev.currentTarget as HTMLElement).style, enter),
    onMouseLeave: (ev: React.MouseEvent<HTMLElement>) => Object.assign((ev.currentTarget as HTMLElement).style, leave),
  });

  return (
    <div style={{ minHeight:'100vh', background:'#f5f7fa', display:'flex', flexDirection:'column', fontFamily:"'Inter',sans-serif" }}>

      {/* Nav */}
      <nav style={{ background:'#0b1f3a', height:64, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px' }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'#00b3a4', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ShieldCheck size={17} color="white"/>
          </div>
          <span style={{ fontWeight:800, fontSize:17, color:'white' }}>TrustLink</span>
        </Link>
        <Link to="/" style={{ fontSize:14, color:'#94afc5', textDecoration:'none', fontWeight:500 }}>← Back to home</Link>
      </nav>

      {/* Body */}
      <div style={{ flex:1, display:'flex' }}>

        {/* Left — branding panel */}
        <div style={{ width:440, background:'#0b1f3a', padding:'60px 48px', display:'flex', flexDirection:'column', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <h2 style={{ fontSize:28, fontWeight:900, color:'white', letterSpacing:'-0.8px', lineHeight:1.2, marginBottom:16 }}>
              Trusted credentials.<br/>
              <span style={{ color:'#00b3a4' }}>Verified in seconds.</span>
            </h2>
            <p style={{ color:'#94afc5', fontSize:15, lineHeight:1.75 }}>
              The tamper-evident credential network connecting universities, students, and employers — powered by cryptographic proof and Aadhaar e-KYC.
            </p>
            <div style={{ marginTop:40, display:'flex', flexDirection:'column', gap:16 }}>
              {[
                ['ECDSA P-256 Signing',     'Every credential carries a cryptographic signature'],
                ['Aadhaar e-KYC',           'UIDAI-compliant national identity verification'],
                ['AI Biometric Matching',   'Facial similarity engine for identity assurance'],
              ].map(([title, desc]) => (
                <div key={title} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                  <div style={{ width:20, height:20, borderRadius:999, background:'#00b3a4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'white' }}>{title}</div>
                    <div style={{ fontSize:12, color:'#5a7090', marginTop:2 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize:11, color:'#3d5470', lineHeight:1.6 }}>
            Demo platform — no real data stored<br/>All identities are synthetic for demonstration
          </div>
        </div>

        {/* Right — login form */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 32px' }}>
          <div style={{ width:'100%', maxWidth:420 }}>
            <h1 style={{ fontSize:26, fontWeight:800, color:'#0b1f3a', letterSpacing:'-0.5px', marginBottom:4 }}>Sign in to TrustLink</h1>
            <p style={{ fontSize:14, color:'#5a6a84', marginBottom:32 }}>
              New here? <Link to="/" style={{ color:'#00b3a4', fontWeight:600, textDecoration:'none' }}>View the demo →</Link>
            </p>

            {error && (
              <div style={{ marginBottom:20, padding:'12px 16px', borderRadius:10, background:'#fee2e2', border:'1px solid #f87171', color:'#dc2626', fontSize:14 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#5a6a84', textTransform:'uppercase', letterSpacing:.6, marginBottom:6 }}>Email Address</label>
                <div style={{ position:'relative' }}>
                  <Mail size={15} color="#8696ad" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)' }}/>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="name@institution.edu"
                    style={{ width:'100%', padding:'12px 14px 12px 38px', borderRadius:10, border:'1.5px solid #dde3ed', background:'white', fontSize:15, color:'#0b1f3a', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                    onFocus={e => ((e.target as HTMLInputElement).style.borderColor = '#00b3a4')}
                    onBlur={e  => ((e.target as HTMLInputElement).style.borderColor = '#dde3ed')}/>
                </div>
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#5a6a84', textTransform:'uppercase', letterSpacing:.6, marginBottom:6 }}>Password</label>
                <div style={{ position:'relative' }}>
                  <Lock size={15} color="#8696ad" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)' }}/>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width:'100%', padding:'12px 14px 12px 38px', borderRadius:10, border:'1.5px solid #dde3ed', background:'white', fontSize:15, color:'#0b1f3a', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                    onFocus={e => ((e.target as HTMLInputElement).style.borderColor = '#00b3a4')}
                    onBlur={e  => ((e.target as HTMLInputElement).style.borderColor = '#dde3ed')}/>
                </div>
              </div>
              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:'14px', borderRadius:10, background:'#0b1f3a', color:'white', fontSize:15, fontWeight:700, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:'inherit' }}
                {...hov({background:'#00b3a4'},{background:'#0b1f3a'})}>
                {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight size={16}/></>}
              </button>
            </form>

            {/* Demo quick-login */}
            <div style={{ marginTop:32, paddingTop:24, borderTop:'1px solid #eef1f6' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#00b3a4', display:'inline-block' }}/>
                <span style={{ fontSize:11, fontWeight:700, color:'#8696ad', textTransform:'uppercase', letterSpacing:.8 }}>Quick Demo Access</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {DEMO_ACCOUNTS.map(d => (
                  <button key={d.label} type="button" onClick={() => fill(d.email, d.pass)}
                    style={{ padding:'10px 12px', borderRadius:10, border:'1.5px solid #dde3ed', background:'white', cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}
                    {...hov({borderColor:'#00b3a4',background:'#f5fffd'},{borderColor:'#dde3ed',background:'white'})}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0b1f3a' }}>{d.label}</div>
                    <div style={{ fontSize:11, color:'#8696ad', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.email}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:24, fontSize:12, color:'#8696ad' }}>
              <ShieldCheck size={14} color="#00b3a4"/>
              <span>ECDSA Authentication · AES-256-GCM Encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
