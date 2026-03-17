import { useEffect, useState } from 'react';
import { supabase, getUserStatus, signInWithGoogle, signOut } from '../../utils/commercial';
import { User, LogOut, Zap } from 'lucide-react';

const Header = () => {
    const [user, setUser] = useState<any>(null);
    const [isPro, setIsPro] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            const status = await getUserStatus();
            setUser(status.user);
            setIsPro(status.isPro);
            
            window.dispatchEvent(new CustomEvent('auth:status', { detail: status }));
        };

        checkStatus();

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event: any) => {
            const status = await getUserStatus();
            setUser(status.user);
            setIsPro(status.isPro);
            window.dispatchEvent(new CustomEvent('auth:status', { detail: status }));
            
            if (event === 'SIGNED_IN') {
                window.history.replaceState(null, '', window.location.pathname);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    return (
        <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            height: '64px',
            backgroundColor: 'var(--panel-bg)',
            borderBottom: '1px solid var(--panel-border)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '8px', 
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold'
                }}>I</div>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>Image Flow</h1>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '-4px' }}>Poetic Signal Toolkit</span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {!isPro && (
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('app:buyPro'))}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                        }}
                    >
                        <Zap size={14} fill="white" />
                        Get PRO
                    </button>
                )}

                {user ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.email}</span>
                        <button 
                            onClick={() => signOut()}
                            style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                            title="Logout"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={() => signInWithGoogle()}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--panel-border)',
                            borderRadius: '6px',
                            padding: '6px 16px',
                            color: 'var(--text-main)',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <User size={16} />
                        Login
                    </button>
                )}
            </div>
        </header>
    );
};

export default Header;
