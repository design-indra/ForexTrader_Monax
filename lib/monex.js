/**
 * lib/monex.js — Monex Investindo Futures API Client
 *
 * Broker: PT Monex Investindo Futures (MONEX)
 * Regulasi: BAPPEBTI No. 442/BAPPEBTI/SI/VII/2007
 *
 * API: Monex menggunakan MetaTrader bridge / REST API internal
 * Base URL REST: https://api.monexnews.com/trading  (contoh endpoint)
 *
 * Untuk live trading:
 * 1. Daftar akun di https://www.mifx.com/
 * 2. Hubungi support untuk aktivasi API access
 * 3. Dapatkan API Key dari portal klien
 *
 * Untuk demo trading:
 * - Daftar akun demo di https://www.mifx.com/id/akun-demo
 * - Demo balance default: $10,000
 *
 * NOTE: Selama API Key tidak dikonfigurasi, bot berjalan
 * full di mode DEMO (simulasi internal) tanpa koneksi broker.
 */

const MONEX_API_KEY    = process.env.MONEX_API_KEY    || '';
const MONEX_ACCOUNT_ID = process.env.MONEX_ACCOUNT_ID || '';
const MONEX_ENV        = process.env.MONEX_ENV        || 'demo'; // demo | live

// Monex REST Bridge URL
const BASE_URL = MONEX_ENV === 'live'
  ? 'https://api.mifx.com/v1'
  : 'https://api-demo.mifx.com/v1';

// ─── Pip values per pair ──────────────────────────────────────────────────────
export const PIP_VALUES = {
  'EUR_USD': 0.0001, 'GBP_USD': 0.0001, 'AUD_USD': 0.0001, 'NZD_USD': 0.0001,
  'USD_CAD': 0.0001, 'USD_CHF': 0.0001, 'EUR_GBP': 0.0001, 'EUR_JPY': 0.01,
  'GBP_JPY': 0.01,  'USD_JPY': 0.01,   'AUD_JPY': 0.01,   'CHF_JPY': 0.01,
  'EUR_CHF': 0.0001,'EUR_AUD': 0.0001, 'GBP_AUD': 0.0001, 'GBP_NZD': 0.0001,
  'XAU_USD': 0.01,  'XAG_USD': 0.001,
};

// ─── Lot Size Options (Monex) ──────────────────────────────────────────────────
// Standard forex lot sizes yang tersedia di Monex:
// Nano    = 0.001 lot  (100 unit)   — pip value ≈ $0.01
// Micro   = 0.01  lot  (1.000 unit) — pip value ≈ $0.10
// Mini    = 0.1   lot  (10.000 unit)— pip value ≈ $1.00
// Standard= 1.0   lot  (100.000 unit)—pip value ≈ $10.00
export const LOT_OPTIONS = [
  { value: 0.001, label: 'Nano (0.001)',     desc: '100 unit · pip ≈ $0.01' },
  { value: 0.01,  label: 'Mikro (0.01)',     desc: '1.000 unit · pip ≈ $0.10' },
  { value: 0.02,  label: 'Mikro ×2 (0.02)', desc: '2.000 unit · pip ≈ $0.20' },
  { value: 0.05,  label: 'Mikro ×5 (0.05)', desc: '5.000 unit · pip ≈ $0.50' },
  { value: 0.1,   label: 'Mini (0.1)',       desc: '10.000 unit · pip ≈ $1.00' },
  { value: 0.2,   label: 'Mini ×2 (0.2)',   desc: '20.000 unit · pip ≈ $2.00' },
  { value: 0.5,   label: 'Half Lot (0.5)',  desc: '50.000 unit · pip ≈ $5.00' },
  { value: 1.0,   label: 'Standard (1.0)',  desc: '100.000 unit · pip ≈ $10.00' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function toInstrument(pair) {
  return pair.replace('/', '_').toUpperCase();
}

export function priceToPips(price, instrument) {
  const pip = PIP_VALUES[instrument] || 0.0001;
  return Math.round(price / pip);
}

export function pipsToPrice(pips, instrument) {
  const pip = PIP_VALUES[instrument] || 0.0001;
  return parseFloat((pips * pip).toFixed(5));
}

// ─── Internal fetch wrapper ───────────────────────────────────────────────────
async function monexFetch(path, options = {}) {
  if (!MONEX_API_KEY) throw new Error('MONEX_API_KEY not configured');
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${MONEX_API_KEY}`,
      'X-Account-ID':  MONEX_ACCOUNT_ID,
      'Content-Type':  'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Monex API error ${res.status}: ${err}`);
  }
  return res.json();
}

/**
 * Ambil candlestick data (OHLCV)
 * Timeframe map: M1, M5, M15, M30, H1, H4, D1
 */
export async function getOHLCV(instrument, granularity = 'M5', count = 100) {
  try {
    const symbol = instrument.replace('_', '');  // EUR_USD → EURUSD
    const data = await monexFetch(
      `/charts/${symbol}?timeframe=${granularity}&count=${count}`
    );
    return (data.candles || []).map(c => ({
      time:   new Date(c.time).getTime(),
      open:   parseFloat(c.open),
      high:   parseFloat(c.high),
      low:    parseFloat(c.low),
      close:  parseFloat(c.close),
      volume: c.volume || 0,
    }));
  } catch (err) {
    console.error('getOHLCV error (fallback demo):', err.message);
    return generateDemoCandles(instrument, count);
  }
}

/**
 * Ambil harga terkini (bid/ask)
 */
export async function getTicker(instrument) {
  try {
    const symbol = instrument.replace('_', '');
    const data = await monexFetch(`/quotes/${symbol}`);
    const bid = parseFloat(data.bid);
    const ask = parseFloat(data.ask);
    return { bid, ask, mid: (bid + ask) / 2, spread: ask - bid, instrument };
  } catch {
    return null;
  }
}

/**
 * Ambil saldo akun Monex
 */
export async function getAccountBalance() {
  try {
    const data = await monexFetch(`/accounts/${MONEX_ACCOUNT_ID}/summary`);
    return {
      balance:      parseFloat(data.balance),
      nav:          parseFloat(data.equity || data.balance),
      unrealizedPL: parseFloat(data.floating_pl || 0),
      marginUsed:   parseFloat(data.margin_used || 0),
      currency:     data.currency || 'USD',
    };
  } catch (err) {
    console.error('getAccountBalance error:', err.message);
    return null;
  }
}

/**
 * Buka order (Market Order)
 * @param {string} instrument  e.g. "EUR_USD"
 * @param {number} units       positif = BUY, negatif = SELL
 * @param {number} stopLoss    harga SL
 * @param {number} takeProfit  harga TP
 */
export async function openTrade(instrument, units, stopLoss, takeProfit) {
  const symbol    = instrument.replace('_', '');
  const side      = units > 0 ? 'buy' : 'sell';
  const lots      = Math.abs(units) / 100000;

  const body = {
    symbol,
    side,
    lots:        lots.toFixed(3),
    order_type:  'market',
    stop_loss:   stopLoss.toFixed(5),
    take_profit: takeProfit.toFixed(5),
    time_in_force: 'FOK',
  };

  return monexFetch(`/accounts/${MONEX_ACCOUNT_ID}/orders`, {
    method: 'POST',
    body:   JSON.stringify(body),
  });
}

/**
 * Tutup posisi berdasarkan trade ID
 */
export async function closeTrade(tradeId) {
  return monexFetch(`/accounts/${MONEX_ACCOUNT_ID}/positions/${tradeId}/close`, {
    method: 'POST',
    body:   JSON.stringify({ lots: 'all' }),
  });
}

/**
 * Ambil posisi terbuka
 */
export async function getOpenTrades() {
  try {
    const data = await monexFetch(`/accounts/${MONEX_ACCOUNT_ID}/positions`);
    return (data.positions || []).map(t => ({
      id:           t.ticket || t.id,
      instrument:   (t.symbol || '').replace(/(.{3})(.{3})/, '$1_$2'), // EURUSD → EUR_USD
      units:        Math.round((t.lots || 0) * 100000) * (t.side === 'sell' ? -1 : 1),
      entryPrice:   parseFloat(t.open_price || t.entry_price || 0),
      openTime:     t.open_time,
      unrealizedPL: parseFloat(t.profit || 0),
    }));
  } catch {
    return [];
  }
}

// ─── Demo candle generator (fallback jika tidak ada API key) ──────────────────
function generateDemoCandles(instrument, count) {
  const pip    = PIP_VALUES[instrument] || 0.0001;
  const prices = {
    EUR_USD: 1.0850, GBP_USD: 1.2650, USD_JPY: 149.50,
    AUD_USD: 0.6550, XAU_USD: 2320.0, GBP_JPY: 189.20,
    NZD_USD: 0.6050, USD_CAD: 1.3650, USD_CHF: 0.8950,
    EUR_JPY: 162.50, GBP_JPY: 189.20, XAG_USD: 27.50,
  };
  // Volatilitas realistis per instrument (dalam USD per candle M5)
  const volatility = {
    XAU_USD: 1.5,   // Gold bergerak $0.5-3 per M5 candle
    XAG_USD: 0.15,  // Silver bergerak $0.05-0.3 per M5 candle
    USD_JPY: 0.15,  // JPY pairs bergerak ~15 pips
    GBP_JPY: 0.25,
    EUR_JPY: 0.20,
  };
  const volRange = volatility[instrument] || pip * 30;
  let base    = prices[instrument] || 1.1000;
  const candles = [];
  const now   = Date.now();
  for (let i = count; i >= 0; i--) {
    const vol   = (Math.random() - 0.5) * 2 * volRange;
    const open  = base;
    const close = open + vol;
    const high  = Math.max(open, close) + Math.random() * volRange * 0.3;
    const low   = Math.min(open, close) - Math.random() * volRange * 0.3;
    const decimals = instrument.includes('JPY') ? 3 : instrument === 'XAU_USD' ? 2 : 5;
    candles.push({
      time:   now - i * 5 * 60000,
      open:   parseFloat(open.toFixed(decimals)),
      high:   parseFloat(high.toFixed(decimals)),
      low:    parseFloat(low.toFixed(decimals)),
      close:  parseFloat(close.toFixed(decimals)),
      volume: Math.floor(Math.random() * 1000) + 100,
    });
    base = parseFloat(close.toFixed(decimals));
  }
  return candles;
}
