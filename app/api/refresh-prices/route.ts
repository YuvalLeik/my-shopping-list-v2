import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { refreshUserPrices } from '@/lib/priceRefresh';

// In-app "refresh prices for this list". Small budget, and items priced in
// the last day are skipped, so repeated taps can't drain the daily quota.
const MANUAL_BUDGET = 15;
const MANUAL_RESOLVE_BUDGET = 5;

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  let items: string[] = [];
  try {
    const body = await request.json();
    userId = typeof body?.userId === 'string' ? body.userId : undefined;
    items = (Array.isArray(body?.items) ? body.items : [])
      .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
      .slice(0, 60);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!userId || items.length === 0) {
    return NextResponse.json({ error: 'userId and items are required' }, { status: 400 });
  }

  const { data: user } = await supabase.from('local_users').select('id').eq('id', userId).maybeSingle();
  if (!user) return NextResponse.json({ error: 'Unknown user' }, { status: 404 });

  try {
    const stats = await refreshUserPrices(userId, {
      budget: MANUAL_BUDGET,
      resolveBudget: MANUAL_RESOLVE_BUDGET,
      onlyItems: items,
      deadline: Date.now() + (maxDuration - 8) * 1000,
    });
    return NextResponse.json(stats);
  } catch (err) {
    console.error('refresh-prices failed', err);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
