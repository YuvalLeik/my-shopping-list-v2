/**
 * Daily supermarket price refresh, run outside Vercel (GitHub Actions) because
 * Cheapersal must be queried one request at a time and a full run takes
 * minutes, longer than a serverless function may live.
 *
 *   npx tsx scripts/refresh-prices.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, CHEAPERSAL_API_KEY.
 */
import { supabase } from '@/lib/supabase';
import { refreshUserPrices, purgeOldPrices } from '@/lib/priceRefresh';

const DAILY_BUDGET = Number(process.env.PRICE_BUDGET ?? 80);
const RESOLVE_BUDGET_PER_USER = 15;
const MAX_RUNTIME_MS = 40 * 60_000;

async function main() {
  const deadline = Date.now() + MAX_RUNTIME_MS;
  const { data: users, error } = await supabase.from('local_users').select('id');
  if (error) throw error;
  if (!users?.length) { console.log('No users'); return; }

  const perUser = Math.max(5, Math.floor(DAILY_BUDGET / users.length));
  let failed = false;
  for (const u of users) {
    const stats = await refreshUserPrices(u.id, { budget: perUser, resolveBudget: RESOLVE_BUDGET_PER_USER, deadline });
    console.log(JSON.stringify(stats));
    if (stats.stoppedEarly === 'api_error' && stats.priced === 0) failed = true;
    if (stats.stoppedEarly === 'quota' || stats.stoppedEarly === 'time') break;
  }
  await purgeOldPrices();
  // Fail the job (so GitHub emails you) when the price API was unusable.
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
