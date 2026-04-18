'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Activity, Zap, Shield, Play, Square,
  RefreshCw, Settings, AlertTriangle, BarChart2, Target, LogOut, ChevronDown,
} from 'lucide-react';
import CandleChart  from './CandleChart';
import TradeLog     from './TradeLog';
import PositionCard from './PositionCard';

// ─── Constants ─────────────────────────────────────────────────────────────────
const PAIR_GROUPS = [
  { label:'💱 Major',  pairs:['EUR_USD','GBP_USD','USD_JPY','AUD_USD','USD_CAD','USD_CHF','NZD_USD'] },
  { label:'💶 Cross',  pairs:['EUR_GBP','EUR_JPY','GBP_JPY','AUD_JPY','EUR_AUD','GBP_AUD','EUR_CHF'] },
  { label:'🥇 Metals', pairs:['XAU_USD','XAG_USD'] },
];
const TIMEFRAMES = ['1m','5m','15m','30m','1h','4h','1d'];
const LEVELS = [
  { id:1, label:'Scalper',      icon:'⚡', color:'#0ea5e9', desc:'RSI7 + EMA Ribbon' },
  { id:2, label:'Smart',        icon:'🧠', color:'#6366f1', desc:'Market filter + confidence' },
  { id:3, label:'AI Score',     icon:'📊', color:'#8b5cf6', desc:'Multi-indicator scoring' },
  { id:4, label:'Adaptive',     icon:'🤖', color:'#f59e0b', desc:'ATR + S/R adaptive' },
  { id:5, label:'Full Context', icon:'🔴', color:'#ef4444', desc:'All filters + divergence' },
];
const TABS = [
  { id:'home',     label:'Home',   icon:'🏠' },
  { id:'chart',    label:'Chart',  icon:'📈' },
  { id:'signal',   label:'Signal', icon:'📡' },
  { id:'risk',     label:'Risk',   icon:'🛡️' },
  { id:'settings', label:'Setup',  icon:'⚙️' },
];

const KURS_DEFAULT = 16500;
const fmtIDR = (usd, kurs = KURS_DEFAULT) => {
  const idr = (usd || 0) * kurs;
  return `Rp ${Math.round(idr).toLocaleString('id-ID')}`;
};
const fmtUSD = fmtIDR;
const fmtPct  = (n) => `${n >= 0 ? '+' : ''}${(n || 0).toFixed(2)}%`;
const fmtPips = (n) => `${n >= 0 ? '+' : ''}${(n || 0).toFixed(1)}p`;
const fmtPrice = (n, inst='') => (n||0).toFixed(inst.includes('JPY') ? 3 : 5);

// ─── Pair Selector ─────────────────────────────────────────────────────────────
function PairSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const display = value?.replace('_', '/') || 'EUR/USD';
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 bg-slate-800/80 border border-slate-600 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-100">
        {display} <ChevronDown size={12}/>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden w-44" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {PAIR_GROUPS.map(g => (
            <div key={g.label}>
              <div className="px-3 py-1.5 text-xs text-slate-500 font-semibold bg-slate-900/50 sticky top-0">{g.label}</div>
              {g.pairs.map(p => (
                <button key={p} onClick={() => { onChange(p); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 ${value === p ? 'text-emerald-400 bg-emerald-900/20' : 'text-slate-200'}`}>
                  {p.replace('_', '/')}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#10b981', icon }) {
  return (
    <div className="rounded-2xl border border-slate-700 p-3" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <div className="font-bold text-lg mono" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ userEmail = '', onLogout }) {
  const [tab,           setTab]           = useState('home');
  const [botData,       setBotData]       = useState(null);
  const [marketData,    setMarketData]    = useState(null);
  const [liveBalance,   setLiveBalance]   = useState(null);
  const [riskSettings,  setRiskSettings]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [liveConfirm,   setLiveConfirm]   = useState(false);
  const [config, setConfig] = useState(() => {
    try { const s = localStorage.getItem('ft_config'); return s ? JSON.parse(s) : { mode:'demo', level:1, instrument:'EUR_USD', tf:'5m', direction:'both', lotSize:0.01 }; }
    catch { return { mode:'demo', level:1, instrument:'EUR_USD', tf:'5m', direction:'both', lotSize:0.01 }; }
  });
  const [localDemo, setLocalDemo] = useState(() => {
    try { const s = localStorage.getItem('ft_demo'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const wakeLockRef = useRef(null);
  const cycleRef    = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('ft_config', JSON.stringify(config)); } catch {}
  }, [config]);

  const saveDemoState = useCallback((demo) => {
    if (!demo) return;
    try { localStorage.setItem('ft_demo', JSON.stringify(demo)); } catch {}
    setLocalDemo(demo);
  }, []);

  const fetchBot = useCallback(async (clientState = null) => {
    try {
      const body = clientState ? { action:'sync', clientState } : undefined;
      const res  = body
        ? await fetch('/api/bot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
        : await fetch('/api/bot');
      const d = await res.json();
      if (d.success) { setBotData(d); if (d.demo) saveDemoState(d.demo); }
    } catch {} finally { setLoading(false); }
  }, [saveDemoState]);

  const fetchMarket = useCallback(async () => {
    try {
      const d = await fetch(`/api/market?instrument=${config.instrument}&tf=${config.tf}&count=100`).then(r => r.json());
      if (d.success) setMarketData(d);
    } catch {}
  }, [config.instrument, config.tf]);

  const fetchLiveBalance = useCallback(async () => {
    if (config.mode === 'demo') return;
    try { const d = await fetch(`/api/balance?mode=${config.mode}`).then(r => r.json()); if (d.success) setLiveBalance(d.balance); else setLiveBalance(null); } catch { setLiveBalance(null); }
  }, [config.mode]);

  const fetchRiskSettings = useCallback(async () => {
    try { const d = await fetch('/api/settings').then(r => r.json()); if (d.success) setRiskSettings(d.risk); } catch {}
  }, []);

  useEffect(() => {
    fetchBot(); fetchMarket(); fetchRiskSettings();
    const b = setInterval(fetchBot, 3000);
    const m = setInterval(fetchMarket, 5000);
    const l = setInterval(fetchLiveBalance, 15000);
    return () => { clearInterval(b); clearInterval(m); clearInterval(l); };
  }, [fetchBot, fetchMarket, fetchLiveBalance, fetchRiskSettings]);

  useEffect(() => { fetchLiveBalance(); }, [config.mode, fetchLiveBalance]);

  // Wake lock
  useEffect(() => {
    async function wl() { if (!('wakeLock' in navigator)) return; try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} }
    if (botData?.bot?.running) wl();
    else if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
  }, [botData?.bot?.running]);

  // Bot cycle interval
  useEffect(() => {
    if (botData?.bot?.running) {
      cycleRef.current = setInterval(async () => {
        try {
          const storedDemo = (() => { try { const s = localStorage.getItem('ft_demo'); return s ? JSON.parse(s) : null; } catch { return null; } })();
          const res = await fetch('/api/bot', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action:'cycle', config:{ instrument:config.instrument, tf:config.tf, lotSize:config.lotSize || 0.01 }, clientState: storedDemo }),
          });
          const d = await res.json();
          if (d.success && d.demo) { saveDemoState(d.demo); setBotData(prev => prev ? { ...prev, demo: d.demo } : prev); }
        } catch {}
      }, 5000);
    } else clearInterval(cycleRef.current);
    return () => clearInterval(cycleRef.current);
  }, [botData?.bot?.running, config.instrument, config.tf, saveDemoState]);

  const handleAction = async (action, extra = {}) => {
    setActionLoading(true);
    try {
      const storedDemo = (() => { try { const s = localStorage.getItem('ft_demo'); return s ? JSON.parse(s) : null; } catch { return null; } })();
      const d = await fetch('/api/bot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, config: { ...config, ...extra }, clientState: storedDemo }),
      }).then(r => r.json());
      if (d.requireConfirmation) { setLiveConfirm(true); return; }
      if (d.demo) saveDemoState(d.demo);
      await fetchBot();
    } catch {} finally { setActionLoading(false); }
  };

  const handleDeleteTrade = async (tradeId) => {
    const storedDemo = (() => { try { const s = localStorage.getItem('ft_demo'); return s ? JSON.parse(s) : null; } catch { return null; } })();
    const d = await fetch('/api/bot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'deleteTrade', config:{tradeId}, clientState: storedDemo }) }).then(r => r.json());
    if (d.success && d.demo) { saveDemoState(d.demo); setBotData(prev => prev ? { ...prev, demo: d.demo } : prev); }
  };

  const handleClearHistory = async () => {
    if (!confirm('Hapus semua riwayat trade?')) return;
    const storedDemo = (() => { try { const s = localStorage.getItem('ft_demo'); return s ? JSON.parse(s) : null; } catch { return null; } })();
    const d = await fetch('/api/bot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'clearHistory', clientState: storedDemo }) }).then(r => r.json());
    if (d.success && d.demo) { saveDemoState(d.demo); setBotData(prev => prev ? { ...prev, demo: d.demo } : prev); }
  };

  const saveRiskSettings = async (newSettings) => {
    try { const d = await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newSettings) }).then(r => r.json()); if (d.success) setRiskSettings(d.risk); } catch {}
  };

  // Derived state
  const bot        = botData?.bot  || {};
  const serverDemo = botData?.demo || {};
  const demo       = localDemo
    ? { ...serverDemo, ...localDemo, openPositions: localDemo.openPositions ?? serverDemo.openPositions, closedTrades: localDemo.closedTrades ?? serverDemo.closedTrades }
    : serverDemo;
  const logs       = botData?.logs || [];
  const ticker     = marketData?.ticker     || {};
  const indicators = marketData?.indicators || {};
  const candles    = marketData?.candles    || [];
  const isLive     = config.mode !== 'demo';
  const isRunning  = bot.running;
  const isPaused   = bot.isPaused;
  const openPos    = demo.openPositions || [];
  const totalBal   = isLive && liveBalance ? liveBalance.balance : (demo.usdBalance || 0);
  const totalPnl   = demo.totalPnl || 0;
  const pnlPct     = demo.totalPnlPct || 0;
  const startBal   = demo.startBalance || 10000;
  const target     = riskSettings?.targetProfitUSD || 3;
  const progress   = Math.min(100, Math.max(0, ((totalBal - startBal) / (target)) * 100));
  const currentLevel = LEVELS.find(l => l.id === (bot.level || config.level)) || LEVELS[0];
  const signal     = bot.lastSignal;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'var(--surface)' }}>
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background:'linear-gradient(135deg,#10b981,#059669)' }}>
          <TrendingUp size={32} className="text-white"/>
        </div>
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"/>
        <p className="text-slate-500 text-sm mt-3">Memuat ForexTrader...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background:'var(--surface)' }}>

      {/* ── HEADER ── */}
      <header className="border-b border-slate-700 px-3 flex items-center justify-between gap-2 sticky top-0 z-40" style={{ height:52, background:'var(--surface-2)' }}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow" style={{ background:'linear-gradient(135deg,#10b981,#059669)' }}>
            <TrendingUp size={16} className="text-white"/>
          </div>
          <span className="font-bold text-slate-100 text-sm">Forex<span className="text-emerald-400">Trader</span></span>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
          <PairSelector value={config.instrument} onChange={(p) => setConfig(c => ({ ...c, instrument: p }))}/>
          {ticker.mid && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="mono font-bold text-slate-100 text-sm truncate">{fmtPrice(ticker.mid, config.instrument)}</span>
              {ticker.change24h !== undefined && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${ticker.change24h >= 0 ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                  {fmtPct(ticker.change24h)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-600'}`}/>
          {onLogout && (
            <button onClick={onLogout} className="text-slate-600 hover:text-slate-400">
              <LogOut size={15}/>
            </button>
          )}
        </div>
      </header>

      {/* Banners */}
      {isPaused && (
        <div className="bg-amber-900/30 border-b border-amber-700/50 px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-400 shrink-0"/>
          <span className="text-xs text-amber-300 font-medium flex-1">Auto-pause: {bot.consecutiveLosses} consecutive losses</span>
          <button onClick={() => handleAction('resume')} className="text-xs bg-amber-500 text-white px-3 py-1 rounded-lg font-bold">Resume</button>
        </div>
      )}
      {isLive && liveBalance === null && (
        <div className="bg-red-900/30 border-b border-red-700/50 px-3 py-2">
          <p className="text-xs text-red-400">⚠️ Saldo Monex gagal dimuat — cek API Key di Settings</p>
        </div>
      )}
      {liveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-xs w-full">
            <AlertTriangle size={32} className="text-amber-400 mx-auto mb-3"/>
            <h3 className="text-white font-bold text-center mb-2">Konfirmasi Live/Practice</h3>
            <p className="text-slate-400 text-sm text-center mb-4">Bot akan trading menggunakan akun Monex (MIFX) {config.mode}. Dana nyata mungkin terpengaruh.</p>
            <div className="flex gap-2">
              <button onClick={() => setLiveConfirm(false)} className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm">Batal</button>
              <button onClick={() => { setLiveConfirm(false); handleAction('start', { confirmed: true }); }} className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold">Ya, Lanjut</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-y-auto pb-20">

        {/* ═══ HOME ═══ */}
        {tab === 'home' && (
          <div className="p-3 space-y-3">

            {/* Control Bar */}
            <div className="rounded-2xl border border-slate-700 p-3 flex items-center gap-3" style={{ background:'var(--surface-2)' }}>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-600'}`}/>
                <span className={`text-xs font-semibold ${isRunning ? 'text-emerald-400' : isPaused ? 'text-amber-400' : 'text-slate-500'}`}>
                  {isRunning ? 'Running' : isPaused ? 'Paused' : 'Stopped'}
                </span>
              </div>
              <div className="flex-1"/>
              {/* Mode selector */}
              <select value={config.mode} onChange={e => setConfig(c => ({ ...c, mode: e.target.value }))}
                disabled={isRunning}
                className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-200 disabled:opacity-50">
                <option value="demo">Demo</option>
                <option value="live">Live</option>
              </select>
              {isRunning ? (
                <button onClick={() => handleAction('stop')} disabled={actionLoading}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold">
                  <Square size={13}/> Stop
                </button>
              ) : (
                <button onClick={() => handleAction('start')} disabled={actionLoading}
                  className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ background:'linear-gradient(135deg,#10b981,#059669)' }}>
                  <Play size={13}/> Start
                </button>
              )}
            </div>

            {/* Balance + PnL */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label={`Saldo ${config.mode.toUpperCase()}`}
                value={fmtUSD(totalBal)}
                sub={`Start: ${fmtUSD(startBal)}`}
                color="#e2e8f0"
                icon="💰"
              />
              <StatCard
                label="Total P&L"
                value={fmtUSD(totalPnl)}
                sub={fmtPct(pnlPct)}
                color={totalPnl >= 0 ? '#10b981' : '#ef4444'}
                icon={totalPnl >= 0 ? '📈' : '📉'}
              />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Trades" value={demo.tradeCount || 0} icon="🔢"/>
              <StatCard
                label="Win Rate"
                value={bot.stats?.totalTrades > 0 ? `${bot.stats.winRate?.toFixed(0)}%` : '-'}
                color={bot.stats?.winRate >= 50 ? '#10b981' : '#ef4444'}
                icon="🎯"
              />
              <StatCard
                label="Streak"
                value={bot.consecutiveWins > 0 ? `W${bot.consecutiveWins}` : bot.consecutiveLosses > 0 ? `L${bot.consecutiveLosses}` : '-'}
                color={bot.consecutiveWins > 0 ? '#10b981' : bot.consecutiveLosses > 0 ? '#ef4444' : '#94a3b8'}
                icon="🔥"
              />
            </div>

            {/* Progress bar */}
            {target > 0 && (
              <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-500">Target Profit</span>
                  <span className="text-slate-300">{fmtUSD(totalPnl)} / {fmtUSD(target)}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width:`${progress}%`, background:'linear-gradient(90deg,#10b981,#059669)' }}/>
                </div>
                <div className="text-xs text-slate-600 mt-1">{progress.toFixed(1)}%</div>
              </div>
            )}

            {/* Level selector */}
            <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
              <div className="text-xs text-slate-500 mb-2 font-semibold">Strategy Level</div>
              <div className="grid grid-cols-5 gap-1.5">
                {LEVELS.map(l => (
                  <button key={l.id}
                    onClick={() => { setConfig(c => ({ ...c, level: l.id })); if (!isRunning) handleAction('sync'); }}
                    disabled={isRunning}
                    className={`flex flex-col items-center p-2 rounded-xl border transition-all text-xs ${config.level === l.id ? 'border-opacity-100' : 'border-slate-700 opacity-60'}`}
                    style={{ background: config.level === l.id ? `${l.color}22` : 'transparent', borderColor: config.level === l.id ? l.color : undefined }}>
                    <span className="text-base mb-0.5">{l.icon}</span>
                    <span className="text-slate-300 text-center leading-tight" style={{ fontSize:9 }}>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Direction + Timeframe */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
                <div className="text-xs text-slate-500 mb-2">Direction</div>
                <div className="flex gap-1">
                  {['both','buy','sell'].map(d => (
                    <button key={d} onClick={() => setConfig(c => ({ ...c, direction: d }))} disabled={isRunning}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${config.direction === d ? 'text-white' : 'bg-slate-700 text-slate-400'}`}
                      style={{ background: config.direction === d ? (d==='both'?'#475569':d==='buy'?'#059669':'#dc2626') : undefined }}>
                      {d === 'both' ? '↕' : d === 'buy' ? '▲' : '▼'} {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
                <div className="text-xs text-slate-500 mb-2">Timeframe</div>
                <div className="flex flex-wrap gap-1">
                  {TIMEFRAMES.map(t => (
                    <button key={t} onClick={() => setConfig(c => ({ ...c, tf: t }))}
                      className={`px-2 py-1 rounded-lg text-xs font-bold ${config.tf === t ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Lot Size Selector */}
            <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
              <div className="flex justify-between items-center mb-2">
                <div className="text-xs text-slate-500 font-semibold">Ukuran Lot</div>
                <div className="text-xs text-emerald-400 font-mono font-bold">{config.lotSize || 0.01} lot</div>
              </div>
              <select
                value={config.lotSize || 0.01}
                onChange={e => setConfig(c => ({ ...c, lotSize: parseFloat(e.target.value) }))}
                disabled={isRunning}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-xs text-slate-200 disabled:opacity-50 focus:outline-none focus:border-emerald-500">
                <option value={0.001}>Nano (0.001) — 100 unit · pip ≈ Rp 165</option>
                <option value={0.01}>Mikro (0.01) — 1.000 unit · pip ≈ Rp 1.650</option>
                <option value={0.02}>Mikro ×2 (0.02) — 2.000 unit · pip ≈ Rp 3.300</option>
                <option value={0.05}>Mikro ×5 (0.05) — 5.000 unit · pip ≈ Rp 8.250</option>
                <option value={0.1}>Mini (0.1) — 10.000 unit · pip ≈ Rp 16.500</option>
                <option value={0.2}>Mini ×2 (0.2) — 20.000 unit · pip ≈ Rp 33.000</option>
                <option value={0.5}>Half Lot (0.5) — 50.000 unit · pip ≈ Rp 82.500</option>
                <option value={1.0}>Standard (1.0) — 100.000 unit · pip ≈ Rp 165.000</option>
              </select>
              <div className="mt-2 text-xs text-slate-600">
                {config.lotSize >= 1.0 ? '⚠️ Standard lot memerlukan margin besar' :
                 config.lotSize >= 0.1 ? '💡 Mini lot, cocok untuk akun $1.000+' :
                 config.lotSize <= 0.001 ? '🔰 Nano lot, ideal untuk belajar & testing' :
                 '✅ Mikro lot, rekomendasi untuk akun Rp 500rb–999rb'}
              </div>
            </div>

            {/* Open Positions */}
            {openPos.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 mb-2">Posisi Terbuka ({openPos.length})</h3>
                <div className="space-y-2">
                  {openPos.map(p => <PositionCard key={p.id} position={p} currentPrice={ticker.mid || p.entryPrice}/>)}
                </div>
              </div>
            )}

            {/* Trade History */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-2">Riwayat Trade</h3>
              <TradeLog trades={demo.closedTrades || []} onDelete={handleDeleteTrade} onClearAll={handleClearHistory}/>
            </div>

            {/* Bot Log */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-2">Bot Log</h3>
              <div className="rounded-2xl border border-slate-700 overflow-hidden" style={{ background:'var(--surface-2)' }}>
                <div className="space-y-0 max-h-64 overflow-y-auto">
                  {logs.length === 0 && <p className="text-xs text-slate-600 text-center py-6">Log kosong</p>}
                  {logs.map((log, i) => (
                    <div key={log.id || i} className={`px-3 py-2 text-xs border-b border-slate-800/50 flex gap-2 ${
                      log.type === 'error'  ? 'text-red-400' :
                      log.type === 'profit' ? 'text-emerald-400' :
                      log.type === 'loss'   ? 'text-red-400' :
                      log.type === 'buy'    ? 'text-emerald-300' :
                      log.type === 'sell'   ? 'text-red-300' :
                      log.type === 'warning'? 'text-amber-400' :
                      log.type === 'system' ? 'text-sky-400' :
                      'text-slate-400'
                    }`}>
                      <span className="text-slate-600 shrink-0">{new Date(log.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ═══ CHART ═══ */}
        {tab === 'chart' && (
          <div className="p-3 space-y-3">
            <div className="rounded-2xl border border-slate-700 overflow-hidden" style={{ background:'var(--surface-2)' }}>
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{config.instrument.replace('_','/')} · {config.tf}</h3>
                  <p className="text-xs text-slate-500">{candles.length} candles</p>
                </div>
                <button onClick={fetchMarket} className="text-slate-500 hover:text-slate-300"><RefreshCw size={15}/></button>
              </div>
              <CandleChart candles={candles} indicators={indicators} instrument={config.instrument}/>
            </div>
            {/* Indicator values */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="RSI 14" value={indicators.rsi14?.toFixed(1) || '-'} color={indicators.rsi14 < 30 ? '#10b981' : indicators.rsi14 > 70 ? '#ef4444' : '#94a3b8'} icon="📊"/>
              <StatCard label="EMA 9 / 21" value={indicators.ema9 ? `${indicators.ema9.toFixed(4)}` : '-'} sub={indicators.ema21 ? `EMA21: ${indicators.ema21.toFixed(4)}` : ''} icon="📉"/>
              <StatCard label="MACD Hist" value={indicators.macd?.histogram?.toFixed(5) || '-'} color={indicators.macd?.histogram >= 0 ? '#10b981' : '#ef4444'} icon="⚡"/>
              <StatCard label="Momentum" value={indicators.momentum?.grade || '-'} sub={`Score: ${indicators.momentum?.score || 0}`} color={indicators.momentum?.score >= 70 ? '#10b981' : '#f59e0b'} icon="💪"/>
            </div>
            {/* Spread & ATR */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Spread" value={ticker.spread ? (ticker.spread * 10000).toFixed(1) + ' pips' : '-'} icon="📏"/>
              <StatCard label="ATR" value={indicators.atr ? indicators.atr.toFixed(5) : '-'} icon="🌊"/>
            </div>
          </div>
        )}

        {/* ═══ SIGNAL ═══ */}
        {tab === 'signal' && (
          <div className="p-3 space-y-3">
            {signal ? (
              <>
                <div className={`rounded-2xl border p-4 text-center ${signal.action === 'BUY' ? 'border-emerald-700/50 bg-emerald-900/10' : signal.action === 'SELL' ? 'border-red-700/50 bg-red-900/10' : 'border-slate-700'}`} style={{ background: signal.action === 'HOLD' ? 'var(--surface-2)' : undefined }}>
                  <div className="text-5xl mb-2">
                    {signal.action === 'BUY' ? '📈' : signal.action === 'SELL' ? '📉' : '⏸️'}
                  </div>
                  <div className={`text-2xl font-bold ${signal.action === 'BUY' ? 'text-emerald-400' : signal.action === 'SELL' ? 'text-red-400' : 'text-slate-400'}`}>
                    {signal.action}
                  </div>
                  <div className="text-slate-500 text-sm mt-1">Score: {signal.score?.toFixed(0) || 50}/100</div>
                  <div className="text-xs text-slate-600 mt-1">Level {signal.level || config.level} · {currentLevel.label}</div>
                </div>

                {/* Score bar */}
                <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-500">Signal Strength</span>
                    <span className="text-slate-300">{signal.score?.toFixed(0) || 50}/100</span>
                  </div>
                  <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${signal.score || 50}%`,
                      background: signal.score >= 65 ? 'linear-gradient(90deg,#10b981,#059669)' : signal.score <= 35 ? 'linear-gradient(90deg,#ef4444,#dc2626)' : '#64748b',
                    }}/>
                  </div>
                </div>

                {/* Signal details */}
                {signal.signals && (
                  <div className="rounded-2xl border border-slate-700 p-3 space-y-2" style={{ background:'var(--surface-2)' }}>
                    <h3 className="text-xs font-semibold text-slate-400">Signal Detail</h3>
                    {Object.entries(signal.signals).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-slate-500 capitalize">{k.replace(/_/g,' ')}</span>
                        <span className={`font-medium ${v === 'bullish' || v === 'oversold' || v === 'near_support' ? 'text-emerald-400' : v === 'bearish' || v === 'overbought' || v === 'near_resistance' ? 'text-red-400' : 'text-slate-300'}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasons */}
                {signal.reasons?.length > 0 && (
                  <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
                    <h3 className="text-xs font-semibold text-slate-400 mb-2">Alasan</h3>
                    {signal.reasons.map((r, i) => <p key={i} className="text-xs text-slate-300 mb-1">• {r}</p>)}
                  </div>
                )}

                {/* Session */}
                {signal.session && (
                  <div className="rounded-2xl border border-slate-700 p-3" style={{ background:'var(--surface-2)' }}>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Sesi Trading</span>
                      <span className="text-slate-200">{signal.session.sessionName}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-slate-500">UTC Time</span>
                      <span className="text-slate-200">{signal.session.utcH?.toString().padStart(2,'0')}:{signal.session.utcM?.toString().padStart(2,'0')} UTC</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-slate-600">
                <Activity size={40} className="mx-auto mb-3 opacity-30"/>
                <p>Jalankan bot untuk melihat sinyal</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ RISK ═══ */}
        {tab === 'risk' && riskSettings && (
          <div className="p-3 space-y-3">
            <div className="rounded-2xl border border-slate-700 p-4" style={{ background:'var(--surface-2)' }}>
              <h3 className="text-sm font-bold text-slate-100 mb-4">Risk Settings</h3>
              <div className="space-y-4">
                {[
                  { key:'maxRiskPercent', label:'Max Risk %/Trade', min:0.5, max:5, step:0.5, suffix:'%' },
                  { key:'stopLossPips',   label:'Stop Loss',        min:10,  max:100,step:5,  suffix:' pips' },
                  { key:'takeProfitPips', label:'Take Profit',      min:20,  max:200,step:10, suffix:' pips' },
                  { key:'trailingStopPips',label:'Trailing Stop',   min:5,   max:50, step:5,  suffix:' pips' },
                  { key:'maxConsecutiveLosses',label:'Max Consec. Losses',min:1,max:10,step:1,suffix:'x' },
                  { key:'targetProfitUSD',label:'Target Profit',   min:1, max:100, step:1, suffix:'' },
                  { key:'cooldownSeconds', label:'Cooldown',        min:10,  max:300, step:10, suffix:' sec' },
                ].map(({ key, label, min, max, step, suffix }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-200 font-bold">
  {key === 'targetProfitUSD'
    ? `Rp ${Math.round((riskSettings[key]||0) * KURS_DEFAULT).toLocaleString('id-ID')}`
    : `${riskSettings[key]}${suffix}`}
</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={riskSettings[key]}
                      onChange={e => { const v = parseFloat(e.target.value); setRiskSettings(s => ({ ...s, [key]: v })); saveRiskSettings({ [key]: v }); }}
                      className="w-full accent-emerald-500"/>
                  </div>
                ))}
              </div>
            </div>

            {/* Profit Modes */}
            <div className="rounded-2xl border border-slate-700 p-4" style={{ background:'var(--surface-2)' }}>
              <h3 className="text-sm font-bold text-slate-100 mb-3">Profit Mode</h3>
              {[
                { key:'maxProfitMode',   label:'Max Profit',   desc:'Dynamic ATR SL/TP, R:R min 1.5x',  color:'#6366f1' },
                { key:'ultraProfitMode', label:'Ultra Profit', desc:'Agresif, risk ×1.5, R:R min 1.0x', color:'#ef4444' },
                { key:'ultraLightMode',  label:'Ultra Light',  desc:'Konservatif, risk ×0.5, R:R min 2.0x', color:'#10b981' },
              ].map(({ key, label, desc, color }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-800">
                  <div>
                    <div className="text-sm text-slate-200" style={{ color: riskSettings[key] ? color : undefined }}>{label}</div>
                    <div className="text-xs text-slate-600">{desc}</div>
                  </div>
                  <button onClick={() => {
                    const all = { maxProfitMode:false, ultraProfitMode:false, ultraLightMode:false };
                    const val = !riskSettings[key];
                    const newR = { ...all, [key]: val };
                    setRiskSettings(s => ({ ...s, ...newR }));
                    saveRiskSettings(newR);
                  }} className={`w-10 h-6 rounded-full transition-colors relative ${riskSettings[key] ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${riskSettings[key] ? 'left-5' : 'left-1'}`}/>
                  </button>
                </div>
              ))}
            </div>

            {/* Exit features */}
            <div className="rounded-2xl border border-slate-700 p-4" style={{ background:'var(--surface-2)' }}>
              <h3 className="text-sm font-bold text-slate-100 mb-3">Exit Features</h3>
              {[
                { key:'partialTpEnabled', label:'Partial Take Profit', desc:'Jual 50% saat TP 50%' },
                { key:'breakevenEnabled', label:'Breakeven Stop',      desc:'Geser SL ke entry setelah profit' },
                { key:'smartExitEnabled', label:'Smart Exit',          desc:'Keluar awal jika sinyal berbalik' },
                { key:'timeExitEnabled',  label:'Time-based Exit',     desc:'Paksa keluar setelah max hold time' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-800">
                  <div>
                    <div className="text-sm text-slate-200">{label}</div>
                    <div className="text-xs text-slate-600">{desc}</div>
                  </div>
                  <button onClick={() => { const v = !riskSettings[key]; setRiskSettings(s => ({ ...s, [key]: v })); saveRiskSettings({ [key]: v }); }}
                    className={`w-10 h-6 rounded-full transition-colors relative ${riskSettings[key] ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${riskSettings[key] ? 'left-5' : 'left-1'}`}/>
                  </button>
                </div>
              ))}
            </div>

            {/* Reset balance */}
            <div className="rounded-2xl border border-slate-700 p-4" style={{ background:'var(--surface-2)' }}>
              <h3 className="text-sm font-bold text-slate-100 mb-3">Reset Demo</h3>
              <div className="flex gap-2">
                {[{idr:500000,label:'Rp 500rb'},{idr:1000000,label:'Rp 1jt'},{idr:5000000,label:'Rp 5jt'},{idr:10000000,label:'Rp 10jt'}].map(({idr,label}) => (
                  <button key={idr} onClick={() => handleAction('reset', { balance: idr/16500 })}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-medium">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === 'settings' && (
          <div className="p-3 space-y-3">
            <div className="rounded-2xl border border-slate-700 p-4" style={{ background:'var(--surface-2)' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🏦</span>
                <h3 className="text-sm font-bold text-slate-100">Monex (MIFX) API Setup</h3>
              </div>
              <div className="space-y-3 text-xs text-slate-400">
                <p>Untuk mode <span className="text-red-400 font-semibold">Live</span>, tambahkan ke file <code className="bg-slate-800 px-1 rounded">.env</code>:</p>
                <div className="bg-slate-900 rounded-xl p-3 font-mono text-slate-300 space-y-1">
                  <p className="text-slate-500"># .env</p>
                  <p>MONEX_API_KEY=<span className="text-emerald-400">your_api_key</span></p>
                  <p>MONEX_ACCOUNT_ID=<span className="text-emerald-400">your_account_id</span></p>
                  <p>MONEX_ENV=<span className="text-emerald-400">live</span></p>
                  <p>AUTH_EMAIL=<span className="text-emerald-400">admin@kamu.app</span></p>
                  <p>AUTH_PASSWORD=<span className="text-emerald-400">password_kamu</span></p>
                </div>
                <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-xl p-3 space-y-1">
                  <p className="text-emerald-400 font-semibold">📋 Cara mendapatkan API Monex:</p>
                  <ol className="space-y-1 list-decimal list-inside text-slate-500">
                    <li>Buka <span className="text-sky-400">mifx.com</span> → Daftar akun</li>
                    <li>Verifikasi KTP & dokumen</li>
                    <li>Login portal klien → API Access</li>
                    <li>Generate API Key & catat Account ID</li>
                  </ol>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
                  <p className="text-slate-400 font-semibold">🔰 Akun Demo Gratis:</p>
                  <p className="text-slate-500">Daftar demo di <span className="text-sky-400">mifx.com/id/akun-demo</span> — balance $10.000, tanpa deposit</p>
                </div>
                <div className="text-slate-600 text-xs pt-1">
                  PT Monex Investindo Futures · BAPPEBTI No. 442/BAPPEBTI/SI/VII/2007
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 p-4" style={{ background:'var(--surface-2)' }}>
              <h3 className="text-sm font-bold text-slate-100 mb-3">Tentang Bot</h3>
              <div className="space-y-2 text-xs text-slate-500">
                <div className="flex justify-between"><span>Versi</span><span className="text-slate-300">ForexTrader v1.1 (Monex)</span></div>
                <div className="flex justify-between"><span>Engine</span><span className="text-slate-300">Next.js 15 + Monex MIFX API</span></div>
                <div className="flex justify-between"><span>Indikator</span><span className="text-slate-300">RSI, EMA, MACD, BB, S/R, Fib, VWAP, ADX</span></div>
                <div className="flex justify-between"><span>Pair Support</span><span className="text-slate-300">19 pair forex + XAU/XAG</span></div>
                <div className="flex justify-between"><span>User</span><span className="text-slate-300">{userEmail}</span></div>
              </div>
            </div>

            {onLogout && (
              <button onClick={onLogout} className="w-full py-3 bg-red-900/30 border border-red-800/50 text-red-400 rounded-2xl text-sm font-semibold">
                Logout
              </button>
            )}
          </div>
        )}

      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-700 flex z-40" style={{ background:'var(--surface-2)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${tab === t.id ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-lg leading-none">{t.icon}</span>
            <span className="text-xs">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
