'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SELECTABLE_CHAINS, prefsFromUserRow } from '@/lib/chains';

/** Settings card: pick the chains the family shops at and the area to price. */
export function ChainPreferences({ userId }: { userId: string }) {
  const [chains, setChains] = useState<string[]>([]);
  const [cities, setCities] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('local_users').select('*').eq('id', userId).maybeSingle().then(({ data }) => {
      const prefs = prefsFromUserRow(data);
      setChains(prefs.preferredChains);
      setCities(prefs.areaCities.join(', '));
    });
  }, [userId]);

  const toggle = (c: string) =>
    setChains((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const save = async () => {
    if (chains.length === 0) { toast.error('בחר לפחות רשת אחת'); return; }
    setSaving(true);
    const areaCities = cities.split(/[,،\n]+/).map((c) => c.trim()).filter(Boolean);
    const { error } = await supabase
      .from('local_users')
      .update({ preferred_chains: chains, price_area_cities: areaCities })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      toast.error('השמירה נכשלה', { description: 'ייתכן שצריך להריץ את המיגרציה user_chain_preferences ב-Supabase' });
    } else {
      toast.success('נשמר — המחירים יתעדכנו בריענון הבא');
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Store className="h-5 w-5" /> הסופרים שלי
        </CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          השוואת המחירים וההמלצה &quot;הכי זול היום&quot; יתייחסו רק לרשתות האלה, לפי סניפים באזור שלך.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SELECTABLE_CHAINS.map((c) => {
            const on = chains.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={on}
                className={`min-h-[40px] px-3 rounded-full border text-sm transition-colors ${
                  on
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">ערים לתמחור (מופרדות בפסיק)</label>
          <Input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="חולון, בת ים" />
        </div>
        <Button onClick={save} disabled={saving}>{saving ? 'שומר…' : 'שמור'}</Button>
      </CardContent>
    </Card>
  );
}
