import { NextResponse } from 'next/server';
import { getAccountBalance } from '../../../lib/monex.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'demo';

  if (mode === 'live') {
    try {
      const balance = await getAccountBalance();
      if (!balance) return NextResponse.json({ success: false, error: 'Gagal ambil saldo Monex — cek API Key' });
      return NextResponse.json({ success: true, balance, mode });
    } catch (err) {
      return NextResponse.json({ success: false, error: err.message });
    }
  }

  return NextResponse.json({ success: true, balance: null, mode: 'demo' });
}
