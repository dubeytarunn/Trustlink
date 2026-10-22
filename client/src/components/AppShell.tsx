import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Building2, FileCheck2, History, LogOut, LayoutDashboard, FileCode, Fingerprint } from 'lucide-react';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate  = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const getNavLinks = () => {
    if (!user) {
      return [
        { name: 'Platform Home',       href: '/',                   icon: ShieldCheck },
        { name: 'Aadhaar e-KYC Demo',  href: '/kyc/aadhaar',        icon: Fingerprint },
        { name: 'Account Login',       href: '/login',              icon: LayoutDashboard },
      ];
    }
    switch (user.role) {
      case 'admin':      return [
        { name: 'Universities',        href: '/admin/universities', icon: Building2 },
        { name: 'Audit & Integrity',   href: '/admin/audit',        icon: History },
        { name: 'Tamper Lab',          href: '/admin/tamper',       icon: FileCode },
        { name: 'Aadhaar e-KYC',       href: '/kyc/aadhaar',        icon: Fingerprint },
      ];
      case 'university': return [
        { name: 'University Portal',   href: '/university',           icon: LayoutDashboard },
        { name: 'Aadhaar e-KYC',       href: '/kyc/aadhaar',          icon: Fingerprint },
      ];
      case 'student':    return [
        { name: 'Credentials Wallet',  href: '/student',              icon: FileCheck2 },
        { name: 'Aadhaar Identity',    href: '/kyc/aadhaar',          icon: Fingerprint },
      ];
      case 'employer':   return [
        { name: 'Verification Portal', href: '/employer',             icon: ShieldCheck },
        { name: 'Aadhaar e-KYC',       href: '/kyc/aadhaar',          icon: Fingerprint },
      ];
      default: return [];
    }
  };

  const navLinks = getNavLinks();
  const roleColors: Record<string,string> = { admin:'#e0e7ff', university:'#e6f9f7', student:'#e6f9f7', employer:'#e0e7ff' };
  const roleTextColors: Record<string,string> = { admin:'#4338ca', university:'#008f83', student:'#008f83', employer:'#4338ca' };

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'#f5f7fa', fontFamily:"'Inter',sans-serif", color:'#0b1f3a' }}>

      {/* SIDEBAR */}
      <aside style={{ width:248, background:'white', borderRight:'1px solid #dde3ed', display:'flex', flexDirection:'column', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          {/* Logo */}
          <div style={{ height:64, display:'flex', alignItems:'center', padding:'0 20px', borderBottom:'1px solid #eef1f6' }}>
            <Link to="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
              <div style={{ width:30, height:30, borderRadius:8, background:'#0b1f3a', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ShieldCheck size={16} color="white"/>
              </div>
              <span style={{ fontWeight:800, fontSize:16, color:'#0b1f3a' }}>TrustLink</span>
            </Link>
          </div>

          {/* User badge */}
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #eef1f6', background:'#fafbfc' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#8696ad', textTransform:'uppercase', letterSpacing:.8 }}>Workspace</span>
              {user ? (
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background:roleColors[user.role]??'#f0f4ff', color:roleTextColors[user.role]??'#0b1f3a' }}>
                  {user.role}
                </span>
              ) : (
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'#f1f5f9', color:'#64748b' }}>
                  Guest
                </span>
              )}
            </div>
            <p style={{ fontSize:12, color:'#5a6a84', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', margin:0 }}>
              {user?.email || 'Public / Demo Session'}
            </p>
          </div>

          {/* Nav */}
          <nav style={{ padding:'12px 12px' }}>
            {navLinks.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.href;
              return (
                <Link key={item.name} to={item.href}
                  style={{
                    display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                    borderRadius:9, marginBottom:2, fontSize:13.5, fontWeight:500,
                    textDecoration:'none', transition:'all .15s',
                    background: active ? '#0b1f3a' : 'transparent',
                    color:      active ? 'white'   : '#3d4f65',
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#f5f7fa'; (e.currentTarget as HTMLElement).style.color = '#0b1f3a'; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#3d4f65'; } }}>
                  <Icon size={16} color={active ? '#00b3a4' : '#8696ad'}/>
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sign in / out */}
        <div style={{ padding:'12px', borderTop:'1px solid #eef1f6' }}>
          {user ? (
            <button onClick={handleLogout}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13.5, fontWeight:500, color:'#dc2626', fontFamily:'inherit' }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#fee2e2')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}>
              <LogOut size={16} color="#dc2626"/>
              Sign Out
            </button>
          ) : (
            <Link to="/login"
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, textDecoration:'none', background:'#0b1f3a', color:'white', fontSize:13.5, fontWeight:600, fontFamily:'inherit', justifyContent:'center' }}>
              Sign In to TrustLink
            </Link>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Topbar */}
        <header style={{ height:64, background:'white', borderBottom:'1px solid #dde3ed', padding:'0 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#8696ad', textTransform:'capitalize' }}>
            {location.pathname.split('/').filter(Boolean).join(' / ')}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:32, height:32, borderRadius:999, background:'#0b1f3a', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ color:'white', fontSize:12, fontWeight:700 }}>
                {user?.email?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex:1, padding:'32px', overflowY:'auto' }}>{children}</main>
      </div>
    </div>
  );
}
