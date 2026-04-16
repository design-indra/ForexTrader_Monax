'use client';
import { TrendingUp, TrendingDown, Target, Shield, Clock } from 'lucide-react';

function fmtPrice(n, instrument = '') {
  const dec = instrument.includes('JPY') ? 3 : 5;
  return (n || 0).toFixed(dec);
}
function fmtPips(n) { return (n >= 0 ? '+' : '') + (n || 0).toFixed(1) + 'p'; }
function fmtUSD(n)  { return (n >= 0 ? '+' : '') + '$' + Math.abs(n || 0).toFixed(2); }

export default function PositionCard({ position, currentPrice }) {
  const isBuy    = position.direction === 'buy';
  const pip      = position.instrument?.includes('JPY') ? 0.01 : 0.0001;
  const pnlPips  = isBuy
    ? (currentPrice - position.entryPrice) / pip
    : (position.entryPrice - currentPrice) / pip;
  const pnlUSD   = pnlPips * (position.lots || 0.01) * 10 * 0.01;
  const isProfit = pnlPips >= 0;
  const holdMins = Math.round((Date.now() - position.openTime) / 60000);

  return (
    <div className={`rounded-2xl border p-4 ${isProfit ? 'border-emerald-700/50 bg-emerald-900/10' : 'border-red-700/50 bg-red-900/10'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isBuy ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {isBuy ? <TrendingUp size={16} className="text-emerald-400"/> : <TrendingDown size={16} className="text-red-400"/>}
          </div>
          <div>
            <div className="font-bold text-slate-100 text-sm">{position.instrument?.replace('_', '/')}</div>
            <div className={`text-xs font-semibold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
              {isBuy ? '▲ BUY' : '▼ SELL'} {position.lots}lot
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-bold text-lg mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>{fmtUSD(pnlUSD)}</div>
          <div className={`text-xs mono ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>{fmtPips(pnlPips)}</div>
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
          <div className="text-slate-500 mb-0.5">Entry</div>
          <div className="text-slate-200 mono font-medium">{fmtPrice(position.entryPrice, position.instrument)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
          <div className="text-slate-500 mb-0.5">SL</div>
          <div className="text-red-400 mono font-medium">{fmtPrice(position.stopLoss, position.instrument)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-2 text-center">
          <div className="text-slate-500 mb-0.5">TP</div>
          <div className="text-emerald-400 mono font-medium">{fmtPrice(position.takeProfit, position.instrument)}</div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Clock size={11}/> {holdMins}m</span>
        {position.momentumGrade && <span className="bg-slate-700/50 px-2 py-0.5 rounded-full">Grade {position.momentumGrade}</span>}
        {position.tp1Triggered  && <span className="text-amber-400">TP1 ✓</span>}
        {position.breakevenSet  && <span className="text-sky-400">BE ✓</span>}
        <span>R:R {position.riskReward}x</span>
      </div>
    </div>
  );
}
