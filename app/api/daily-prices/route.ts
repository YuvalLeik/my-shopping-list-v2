import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { refreshUserPrices, purgeOldPrices, RefreshStats } from '@/lib/priceRefresh';

// Cheapersal's free plan allows ~100 requests/day. The cron uses most of it
// and leaves headroom for the in-app "refresh prices" button.
const DAILY_CRON_BUDGET = 80;
const RESOLVE_BUDGET_PER_USER = 10;

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Leave a few seconds to write results before the platform kills us.
  const deadline = Date.now() + (maxDuration - 12) * 1000;

  try {
    const { data: users } = await supabase.from('local_users').select('id');
    if (!users?.length) {
      return NextResponse.json({ message: 'No users found', processed: 0 });
    }

    const perUserBudget = Math.max(5, Math.floor(DAILY_CRON_BUDGET / users.length));
    const perUser: RefreshStats[] = [];
    for (const user of users) {
      const stats = await refreshUserPrices(user.id, {
        budget: perUserBudget,
        resolveBudget: RESOLVE_BUDGET_PER_USER,
        deadline,
      });
      perUser.push(stats);
      console.log('daily-prices', JSON.stringify(stats));
      if (stats.stoppedEarly === 'quota' || stats.stoppedEarly === 'time') break;
    }

    await purgeOldPrices();

    return NextResponse.json({
      message: 'Daily prices updated',
      users: users.length,
      totalInserted: perUser.reduce((s, u) => s + u.insertedRows, 0),
      perUser,
    });
  } catch (error) {
    console.error('Daily prices cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
