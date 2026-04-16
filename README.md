# 📊 ForexTrader — AI-Powered Forex Trading Bot

Diadaptasi dari **IndoTrader** (crypto Indodax) ke **Forex** dengan broker **PT Monex Investindo Futures (MIFX)** — broker forex terpercaya Indonesia, regulasi BAPPEBTI.

---

## 🔑 Fitur Utama

| Fitur | Detail |
|-------|--------|
| **19 Pair Forex** | EUR/USD, GBP/USD, USD/JPY, XAU/USD, dll |
| **BUY & SELL** | Bisa long dan short (forex support dua arah) |
| **5 Level Bot** | Scalper → Smart → AI Score → Adaptive → Full Context |
| **Demo Mode** | Paper trading $10.000 tanpa API key |
| **Live Mode** | Monex MIFX live account (uang nyata) |
| **Indikator** | RSI, EMA, MACD, BB, S/R, Fibonacci, VWAP, ADX, Divergence |
| **Risk Manager** | Lot sizing otomatis, Trailing Stop, Partial TP, Breakeven |
| **Ukuran Lot** | Nano (0.001) hingga Standard (1.0) — bisa dipilih di UI |
| **Session Filter** | Tokyo, London, New York, Overlap detection |
| **Mobile PWA** | Bisa diinstall di HP seperti aplikasi |

---

## 🚀 Quick Start (Demo Mode — Tanpa API Key)

```bash
# 1. Clone / upload ke Termux atau PC
cd forextrader

# 2. Install dependencies
npm install

# 3. Copy env (tidak perlu isi API key untuk demo)
cp .env.example .env

# 4. Jalankan
npm run dev
```

Buka `http://localhost:3000` → Login dengan kredensial di `.env`.

---

## 🏦 Setup Live Trading (Monex MIFX)

### 1. Daftar Akun
- Buka [mifx.com](https://www.mifx.com)
- Pilih **Buka Akun** → lengkapi data & verifikasi KTP
- Untuk testing tanpa deposit: [mifx.com/id/akun-demo](https://www.mifx.com/id/akun-demo)

### 2. Dapatkan API Key
- Login portal klien Monex
- Masuk ke menu **API Access**
- Generate API Key dan catat Account ID

### 3. Konfigurasi `.env`
```env
MONEX_API_KEY=your_api_key_here
MONEX_ACCOUNT_ID=your_account_id_here
MONEX_ENV=live
```

---

## 📦 Ukuran Lot yang Tersedia

| Lot | Unit | Pip Value (EUR/USD) | Cocok Untuk |
|-----|------|---------------------|-------------|
| 0.001 (Nano) | 100 | ~$0.01 | Belajar & testing |
| 0.01 (Mikro) | 1.000 | ~$0.10 | Akun $100–$999 |
| 0.05 (Mikro ×5) | 5.000 | ~$0.50 | Akun $500+ |
| 0.1 (Mini) | 10.000 | ~$1.00 | Akun $1.000+ |
| 0.5 (Half) | 50.000 | ~$5.00 | Akun $5.000+ |
| 1.0 (Standard) | 100.000 | ~$10.00 | Akun $10.000+ |

---

## 🚢 Deploy ke Railway

```bash
# Push ke GitHub, lalu connect di railway.app
# Set environment variables di Railway dashboard
```

---

## 📁 Struktur File

```
forextrader/
├── lib/
│   ├── monex.js          # Monex MIFX API client (broker utama)
│   ├── tradingEngine.js  # Sinyal & logic trading
│   ├── riskManager.js    # Lot sizing, SL/TP, risk management
│   ├── indicators.js     # RSI, EMA, MACD, BB, ADX, dll
│   └── demoStore.js      # State demo trading
├── app/api/
│   ├── bot/route.js      # Controller bot
│   ├── market/route.js   # Data market & indikator
│   ├── balance/route.js  # Saldo akun
│   ├── settings/route.js # Risk settings
│   └── auth/route.js     # Login
└── components/
    └── Dashboard.jsx     # UI utama
```

---

**Broker:** PT Monex Investindo Futures (MIFX)  
**Regulasi:** BAPPEBTI No. 442/BAPPEBTI/SI/VII/2007  
**Website:** [mifx.com](https://www.mifx.com)
