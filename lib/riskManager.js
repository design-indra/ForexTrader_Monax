/**
 * lib/riskManager.js — Forex Risk Management
 * Diadaptasi dari IndoTrader v5
 *
 * Perbedaan utama vs crypto:
 * - Unit: USD bukan IDR
 * - Lot sizing (micro/mini/standard)
 * - Risk % dari balance (bukan IDR nominal)
 * - Pip-based SL/TP
 */

let runtimeSettings = {
  maxPositions:         parseInt(process.env.MAX_POSITIONS          || '1'),
  maxRiskPercent:       parseFloat(process.env.MAX_RISK_PERCENT     || '2'),   // 2% per trade (standar forex)
  stopLossPips:         parseFloat(process.env.STOP_LOSS_PIPS       || '30'),
  takeProfitPips:       parseFloat(process.env.TAKE_PROFIT_PIPS     || '60'),
  trailingStopPips:     parseFloat(process.env.TRAILING_STOP_PIPS   || '15'),
  maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '3'),
  defaultLotSize:       parseFloat(process.env.DEFAULT_LOT_SIZE     || '0.001'), // micro lot
  cooldownSeconds:      30,
  minAccountUSD:        5,   // minimum balance untuk trading
  maxHoldMinutes:       240,   // 4 jam max hold (forex bergerak lambat)
  targetProfitUSD:      3,   // target profit dalam USD

  // Profit modes
  maxProfitMode:    false,
  ultraProfitMode:  false,
  ultraLightMode:   false,

  // Exit features
  partialTpEnabled: true,
  breakevenEnabled: true,
  smartExitEnabled: true,
  timeExitEnabled:  true,

  // Auto Compounding
  autoCompound:     false, // false = pakai lot manual, true = lot naik otomatis sesuai saldo
};

export function getRiskSettings()               { return { ...runtimeSettings }; }
export function updateRiskSettings(newSettings) {
  runtimeSettings = { ...runtimeSettings, ...newSettings };
  return runtimeSettings;
}

export function getActiveProfitMode() {
  if (runtimeSettings.ultraProfitMode) return 'ultra_profit';
  if (runtimeSettings.ultraLightMode)  return 'ultra_light';
  if (runtimeSettings.maxProfitMode)   return 'max_profit';
  return 'normal';
}

/**
 * Hitung lot size berdasarkan risk management forex standard
 * Formula: Lot = (Balance × Risk%) / (SL in pips × Pip Value per Lot)
 *
 * Pip value per standard lot (100k units):
 * - EUR/USD: $10 per pip
 * - USD/JPY: $9.xx per pip (tergantung kurs)
 * - Micro lot (0.01): $0.10 per pip
 * - Mini lot (0.1):   $1.00 per pip
 */
export function calculateLotSize(balance, slPips, instrument = 'EUR_USD', botState = {}, signalGrade = 'C') {
  const { consecutiveLosses = 0, consecutiveWins = 0 } = botState;
  const s    = runtimeSettings;
  const mode = getActiveProfitMode();

  if (balance < s.minAccountUSD) return { lots: 0, reason: 'balance_tidak_cukup' };

  // ── AUTO COMPOUNDING ────────────────────────────────────────────────────────
  // Jika autoCompound ON → hitung lot otomatis berdasarkan saldo
  // Jika autoCompound OFF → gunakan defaultLotSize dari setting UI
  if (!s.autoCompound) {
    // Mode manual — pakai lot dari UI setting
    const fixedLot = s.defaultLotSize || 0.01;
    const pipValuePerMicroLot = instrument === 'XAU_USD' ? 1.0
      : instrument === 'XAG_USD' ? 0.50
      : instrument.includes('JPY') ? 0.0932
      : 0.10;
    const riskAmount = slPips * pipValuePerMicroLot * fixedLot;
    const riskPercent = parseFloat(((riskAmount / balance) * 100).toFixed(2));
    return {
      lots: fixedLot,
      riskAmount: parseFloat(riskAmount.toFixed(4)),
      riskPercent,
      reason: 'manual_fixed_lot',
      gradeMult: 1,
    };
  }

  // ── AUTO COMPOUND MODE ──────────────────────────────────────────────────────
  // Formula: setiap kelipatan balance awal, lot naik 1 step
  // Contoh dengan base $30 (Rp 500rb):
  //   $0   - $30   → 0.001 lot (nano)
  //   $30  - $60   → 0.01  lot (mikro)
  //   $60  - $120  → 0.02  lot
  //   $120 - $240  → 0.05  lot
  //   $240 - $500  → 0.1   lot (mini)
  //   $500 - $1000 → 0.2   lot
  //   $1000+       → 0.5   lot

  const LOT_TIERS = [
    { minBalance: 0,    lot: 0.001 },
    { minBalance: 30,   lot: 0.01  },
    { minBalance: 60,   lot: 0.02  },
    { minBalance: 120,  lot: 0.05  },
    { minBalance: 240,  lot: 0.1   },
    { minBalance: 500,  lot: 0.2   },
    { minBalance: 1000, lot: 0.5   },
    { minBalance: 3000, lot: 1.0   },
  ];

  // Cari tier yang sesuai dengan saldo
  let autoLot = 0.001;
  for (const tier of LOT_TIERS) {
    if (balance >= tier.minBalance) autoLot = tier.lot;
  }

  // Apply loss streak protection
  if (consecutiveLosses >= 3)       autoLot = LOT_TIERS[0].lot; // kembali ke terkecil
  else if (consecutiveLosses === 2) autoLot = Math.max(autoLot * 0.5, 0.001);
  else if (consecutiveLosses === 1) autoLot = Math.max(autoLot * 0.75, 0.001);

  // Mode modifier
  if (mode === 'ultra_light') autoLot = Math.max(autoLot * 0.5, 0.001);
  if (mode === 'ultra_profit') autoLot = Math.min(autoLot * 1.5, 1.0);

  // Streak bonus
  if (consecutiveWins >= 5) autoLot = Math.min(autoLot * 1.2, 1.0);

  // Round ke 3 desimal
  autoLot = parseFloat(autoLot.toFixed(3));

  const pipValuePerMicroLot = instrument === 'XAU_USD' ? 1.0
    : instrument === 'XAG_USD' ? 0.50
    : instrument.includes('JPY') ? 0.0932
    : 0.10;
  const riskAmount  = slPips * pipValuePerMicroLot * autoLot;
  const riskPercent = parseFloat(((riskAmount / balance) * 100).toFixed(2));

  return {
    lots: autoLot,
    riskAmount: parseFloat(riskAmount.toFixed(4)),
    riskPercent,
    reason: `auto_compound_tier_${autoLot}lot`,
    gradeMult: 1,
  };
}

export function canOpenPosition(openCount, consecutiveLosses, isPaused) {
  const s = runtimeSettings;
  if (isPaused) return { allowed: false, reason: 'bot_paused' };
  if (openCount >= s.maxPositions) return { allowed: false, reason: 'max_positions' };
  if (consecutiveLosses >= s.maxConsecutiveLosses) return { allowed: false, reason: 'consecutive_losses' };
  return { allowed: true };
}

const PIP_MAP = {
  'EUR_USD':0.0001,'GBP_USD':0.0001,'AUD_USD':0.0001,'NZD_USD':0.0001,
  'USD_CAD':0.0001,'USD_CHF':0.0001,'EUR_GBP':0.0001,'EUR_AUD':0.0001,
  'GBP_AUD':0.0001,'GBP_NZD':0.0001,'EUR_CHF':0.0001,
  'EUR_JPY':0.01,'GBP_JPY':0.01,'USD_JPY':0.01,'AUD_JPY':0.01,'CHF_JPY':0.01,
  'XAU_USD':0.01,'XAG_USD':0.001,
};
function getPip(instrument) { return PIP_MAP[instrument] || 0.0001; }

export function getStopLossPrice(entryPrice, direction, slPips, instrument) {
  const pip     = getPip(instrument);
  const slPrice = slPips * pip;
  return direction === 'buy'
    ? parseFloat((entryPrice - slPrice).toFixed(5))
    : parseFloat((entryPrice + slPrice).toFixed(5));
}

export function getTakeProfitPrice(entryPrice, direction, tpPips, instrument) {
  const pip     = getPip(instrument);
  const tpPrice = tpPips * pip;
  return direction === 'buy'
    ? parseFloat((entryPrice + tpPrice).toFixed(5))
    : parseFloat((entryPrice - tpPrice).toFixed(5));
}

export function checkPositionExit(position, currentPrice) {
  const s   = runtimeSettings;
  const pip = getPip(position.instrument);
  const dir = position.direction || 'buy';
  const isBuy = dir === 'buy';

  const pnlPips = isBuy
    ? (currentPrice - position.entryPrice) / pip
    : (position.entryPrice - currentPrice) / pip;

  const pnlUSD = pnlPips * (position.lots || 0.01) * (isBuy ? 10 : 10) * 0.01; // approx

  // SL hit
  if (isBuy  && currentPrice <= position.stopLoss)   return { shouldClose: true, reason: 'stop_loss',   pnlPips, pnlUSD };
  if (!isBuy && currentPrice >= position.stopLoss)   return { shouldClose: true, reason: 'stop_loss',   pnlPips, pnlUSD };
  // TP hit
  if (isBuy  && currentPrice >= position.takeProfit) return { shouldClose: true, reason: 'take_profit', pnlPips, pnlUSD };
  if (!isBuy && currentPrice <= position.takeProfit) return { shouldClose: true, reason: 'take_profit', pnlPips, pnlUSD };

  // Partial TP (50% dari target)
  const partialLevel = isBuy
    ? position.entryPrice + (position.takeProfit - position.entryPrice) * 0.5
    : position.entryPrice - (position.entryPrice - position.takeProfit) * 0.5;
  if (!position.tp1Triggered) {
    if ((isBuy && currentPrice >= partialLevel) || (!isBuy && currentPrice <= partialLevel)) {
      return { shouldPartial: true, partialPct: 50, pnlPips, pnlUSD };
    }
  }

  // Breakeven
  const breakevenLevel = isBuy
    ? position.entryPrice + (position.takeProfit - position.entryPrice) * 0.3
    : position.entryPrice - (position.entryPrice - position.takeProfit) * 0.3;
  if (!position.breakevenSet) {
    if ((isBuy && currentPrice >= breakevenLevel) || (!isBuy && currentPrice <= breakevenLevel)) {
      return { shouldBreakeven: true, newStopLoss: position.entryPrice + (isBuy ? pip * 2 : -pip * 2), pnlPips, pnlUSD };
    }
  }

  // Time-based exit
  if (s.timeExitEnabled && position.openTime) {
    const holdMs = Date.now() - position.openTime;
    if (holdMs > s.maxHoldMinutes * 60 * 1000) {
      return { shouldClose: true, reason: 'time_exit', pnlPips, pnlUSD };
    }
  }

  return { shouldClose: false, pnlPips, pnlUSD };
}

export function updateTrailingStop(position, currentPrice) {
  if (!position.trailingStop) return position;
  const s   = runtimeSettings;
  const pip = getPip(position.instrument);
  const dir = position.direction || 'buy';
  const isBuy = dir === 'buy';
  const trailDist = (s.trailingStopPips || 15) * pip;

  if (isBuy) {
    const newTrail = currentPrice - trailDist;
    if (newTrail > position.stopLoss) return { ...position, stopLoss: parseFloat(newTrail.toFixed(5)) };
  } else {
    const newTrail = currentPrice + trailDist;
    if (newTrail < position.stopLoss) return { ...position, stopLoss: parseFloat(newTrail.toFixed(5)) };
  }
  return position;
}

export function checkSignalReversal(position, currentPrice, signal) {
  const dir     = position.direction || 'buy';
  const isBuy   = dir === 'buy';
  const pip     = getPip(position.instrument);
  const pnlPips = isBuy
    ? (currentPrice - position.entryPrice) / pip
    : (position.entryPrice - currentPrice) / pip;
  const pnlUSD = pnlPips * (position.lots || 0.01) * 0.10;

  if (isBuy && signal.action === 'SELL' && signal.score < 30 && pnlPips > 5) {
    return { shouldExit: true, reason: 'smart_signal_exit', pnlPips, pnlUSD };
  }
  if (!isBuy && signal.action === 'BUY' && signal.score > 70 && pnlPips > 5) {
    return { shouldExit: true, reason: 'smart_signal_exit', pnlPips, pnlUSD };
  }
  return { shouldExit: false, pnlPips, pnlUSD };
}

// Pair blacklist (untuk pair yang sering rugi)
const blacklistedPairs = new Map();
export function isPairBlacklisted(pair)   { const b = blacklistedPairs.get(pair); return b ? Date.now() < b.until : false; }
export function reportPairLoss(pair) {
  const rec = blacklistedPairs.get(pair) || { losses: 0 };
  rec.losses++;
  if (rec.losses >= 2) { rec.until = Date.now() + 60 * 60 * 1000; blacklistedPairs.set(pair, rec); return true; }
  blacklistedPairs.set(pair, rec);
  return false;
}
export function resetPairLoss(pair)       { blacklistedPairs.delete(pair); }
export function getBlacklistedPairs()     { return [...blacklistedPairs.entries()].filter(([,v])=>Date.now()<v.until).map(([pair,v])=>({pair,remainingMs:v.until-Date.now(),reason:'pair_loss_streak'})); }
