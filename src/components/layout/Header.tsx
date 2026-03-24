import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../utils/commercial';
import { LogIn, LogOut, Zap, Info, X } from 'lucide-react';

export const Header: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [, setIsPro] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    useEffect(() => {
        const client = supabase;
        if (!client) return;

        client.auth.getUser().then(({ data: { user: foundUser } }: any) => {
            setUser(foundUser);
            // Force Pro status regardless of profile
            const finalPro = true;
            (window as any).__isPro = finalPro;
            setIsPro(finalPro);
            window.dispatchEvent(new CustomEvent('auth:status', { detail: { user: foundUser, isPro: finalPro } }));
            setTimeout(() => window.dispatchEvent(new CustomEvent('auth:status', { detail: { user: foundUser, isPro: finalPro } })), 200);
        });

        const { data: authListener } = client.auth.onAuthStateChange(async (_event: any, session: any) => {
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            // Force Pro status regardless of session
            const finalPro = true;
            (window as any).__isPro = finalPro;
            setIsPro(finalPro);
            window.dispatchEvent(new CustomEvent('auth:status', { detail: { user: currentUser, isPro: finalPro } }));
            setTimeout(() => window.dispatchEvent(new CustomEvent('auth:status', { detail: { user: currentUser, isPro: finalPro } })), 200);
        });

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, []);

    const login = () => supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    const logout = () => supabase?.auth.signOut();

    return (
        <header className="toolkit-header">
            <div className="header-left">
                <div className="toolkit-brand">
                    <svg className="brand-icon" viewBox="0 0 48 48" fill="none"><path d="M10 10 L38 10 Q36 18 38 24 Q40 30 38 38 L10 38 Q12 30 10 24 Q8 18 10 10Z" stroke="#7c5cfc" strokeWidth="1.2" fill="none" opacity="0.4"/><path d="M12 18 Q20 14 28 20 Q36 26 38 18" stroke="#7c5cfc" strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M10 26 Q18 22 26 28 Q34 34 40 26" stroke="#5ce0fc" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                    <span className="toolkit-name">Poetic Signal Toolkit</span>
                </div>
                <div className="app-separator">/</div>
                <div className="app-name">Image Flow</div>
                <button onClick={() => setShowInfo(true)} className="info-btn">
                    <Info className="w-4 h-4" />
                </button>
            </div>

            <div className="header-right">
                {user ? (
                    <div className="user-profile">
                        <div className="pro-badge active">
                            <Zap className="w-3 h-3" />
                            PRO
                        </div>
                        <span className="user-email">{user.email}</span>
                        <button onClick={logout} className="icon-btn" title="Logout">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="user-profile">
                        <div className="pro-badge active">
                            <Zap className="w-3 h-3" />
                            PRO
                        </div>
                        <span className="user-email">Local Mode</span>
                        <button onClick={login} className="icon-btn" title="Login for Sync">
                            <LogIn className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                .toolkit-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.75rem 1.5rem;
                    background: rgba(15, 23, 42, 0.85);
                    backdrop-filter: blur(12px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    position: sticky;
                    top: 0;
                    z-index: 1000;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    font-size: 0.875rem;
                }
                .header-left, .header-right {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .toolkit-brand {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: #7c5cfc;
                }
                .brand-icon {
                    width: 1.25rem;
                    height: 1.25rem;
                }
                .toolkit-name {
                    font-size: 0.85rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                    color: #fff;
                }
                .app-separator {
                    color: rgba(255, 255, 255, 0.2);
                    font-weight: 300;
                    margin: 0 0.25rem;
                }
                .app-name {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.85rem;
                    font-weight: 500;
                }
                .user-profile {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    background: rgba(255, 255, 255, 0.06);
                    padding: 0.35rem 0.5rem 0.35rem 0.75rem;
                    border-radius: 9999px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .pro-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.7rem;
                    font-weight: 800;
                    padding: 0.2rem 0.5rem;
                    border-radius: 9999px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #94a3b8;
                    letter-spacing: 0.05em;
                }
                .pro-badge.active {
                    background: #f59e0b;
                    color: #fff;
                    box-shadow: 0 0 10px rgba(245, 158, 11, 0.3);
                }
                .user-email {
                    font-size: 0.85rem;
                    color: rgba(255, 255, 255, 0.9);
                    font-weight: 500;
                    letter-spacing: 0.01em;
                }
                .upgrade-btn {
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                    color: #fff;
                    border: none;
                    padding: 0.3rem 0.8rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
                }
                .upgrade-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
                }
                .login-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #fff;
                    color: #0f172a;
                    border: none;
                    padding: 0.5rem 1.25rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
                }
                .login-btn:hover {
                    background: #f8fafc;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
                }
                .icon-btn {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.5);
                    cursor: pointer;
                    padding: 0.4rem;
                    display: flex;
                    align-items: center;
                    border-radius: 50%;
                    transition: all 0.2s ease;
                }
                .icon-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.1);
                }
           
                .info-modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
                    display: flex; align-items: center; justify-content: center; z-index: 99999;
                }
                .info-modal {
                    background: #111827; border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 16px; padding: 32px; max-width: 600px;
                    width: 90%; max-height: 85vh; overflow-y: auto;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                    position: relative;
                    text-align: left;
                }
                .info-modal h2 { margin-top: 0; color: #f8fafc; font-size: 1.5rem; }
                .info-modal h3 { color: #7c5cfc; font-size: 0.85rem; margin-bottom: 24px; font-weight: 600; }
                .info-modal p { color: #cbd5e1; line-height: 1.6; font-size: 0.9rem; margin-bottom: 12px; }
                .info-modal ul { color: #cbd5e1; font-size: 0.85rem; padding-left: 20px; list-style-type: none; margin:0; padding:0; }
                .info-modal li { margin-bottom: 8px; font-weight: 500; color: #94a3b8; }
                .info-close {
                    position: absolute; top: 16px; right: 16px;
                    background: transparent; border: none; color: #64748b;
                    cursor: pointer; padding: 6px; border-radius: 6px; transition: all 0.2s;
                }
                .info-close:hover { color: #f8fafc; background: rgba(255,255,255,0.1); }
                .info-btn {
                    background: transparent; border: none; color: #64748b; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    margin-left: 12px; transition: color 0.2s;
                }
                .info-btn:hover { color: #f8fafc; }
    
            `}
            </style>
        
            {showInfo && createPortal(
                <div className="info-modal-overlay" onClick={() => setShowInfo(false)}>
                    <div className="info-modal" onClick={e => e.stopPropagation()}>
                        <button className="info-close" onClick={() => setShowInfo(false)}><X className="w-5 h-5"/></button>
                        <h2>Image Flow</h2>
                        <h3>Fluid Dynamics Image Distortion | 流体力学 画像ディストーション</h3>
                        
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', marginBottom: '8px' }}>EN</div>
                            <p>Image Flow treats static pixels as liquid. Utilizing fluid dynamic simulations, this tool allows users to distort, push, pull, and warp images interactively. By setting viscosity, flow speed, and turbulence parameters, users can create melting, dripping, or swirling optical effects. It bridges the gap between static photography and mesmerizing digital flow arts.</p>
                            <ul><li>Key Features: Fluid Simulation Integration, Interactive Warping, Distortion Mapping, Cinematic Exports.</li></ul>
                        </div>

                        <div>
                            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', marginBottom: '8px' }}>JP</div>
                            <p>Image Flowは、静止画のピクセルを「液体」のように扱うビジュアルモジュレーターです。流体力学のシミュレーションを取り入れており、ユーザーの操作に応じて画像が溶け出したり、波打ったり、うねりを上げたりと、インタラクティブに歪ませることができます。粘度（Viscosity）や流速（Flow Speed）などの物理パラメータを調整することで、単なる写真から、催眠的で美しいデジタル・フローアートを創出します。</p>
                            <ul><li>主要機能: 流体力学シミュレーション、インタラクティブなワーピング（歪み）、アーティスティックなエクスポート。</li></ul>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </header>
    );
};
