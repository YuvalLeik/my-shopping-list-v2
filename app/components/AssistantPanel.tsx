'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Mic, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createGroceryItem, deleteGroceryItem, updateGroceryItem, GroceryItem } from '@/lib/groceryItems';
import { updateListTotalCost } from '@/lib/groceryLists';
import { normalizeItemName } from '@/lib/shoppingItems';
import { loadPurchaseHistory, getListSuggestions, ItemHistory } from '@/lib/suggestions';
import { getItemAveragePrices } from '@/lib/itemPrices';
import { suggestCategory } from '@/lib/autoCategory';
import { useSpeechInput } from '@/lib/useSpeechInput';
import { t } from '@/lib/translations';
import { toast } from 'sonner';

interface AssistantPanelProps {
  userId: string | null;
  selectedListId: string | null;
  currentListItems?: GroceryItem[]; // Current items in the active list
  onClose: () => void;
  onItemsAdded?: () => void;
  priorListId?: string | null;
  priorListTotalCost?: number | null;
  onPriorListCostUpdated?: () => void;
}

interface ProposedAdd { name: string; qty: number; why?: string | null }
interface Proposal {
  add: ProposedAdd[];
  remove: string[];
  setQty: { name: string; qty: number }[];
}
interface Message {
  text: string;
  isUser: boolean;
  proposal?: Proposal;
  /** Proposal lines the user unticked, keyed "add:name" / "remove:name" / "qty:name". */
  off?: Set<string>;
  applied?: boolean;
  /** After the free "build my list", offer the AI to fill gaps. */
  offerImprove?: boolean;
}

/** Context sent to the AI: the family's most-bought items, compactly. */
const FAMILY_CONTEXT_SIZE = 80;

const QUICK_ACTIONS: Array<{ label: string; send?: string; prefill?: string }> = [
  { label: '📝 בנה לי רשימה' },
  { label: '🤔 מה חסר?', send: 'מה חסר לי ברשימה?' },
  { label: '🍝 רעיון לארוחה', prefill: 'ארוחה: ' },
  { label: '💰 תקציב', prefill: 'יש לי ₪ ' },
];

const proposalSize = (p: Proposal) => p.add.length + p.remove.length + p.setQty.length;

export function AssistantPanel({ userId, selectedListId, currentListItems = [], onClose, onItemsAdded, priorListId = null, priorListTotalCost = null, onPriorListCostUpdated }: AssistantPanelProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [priorCostInput, setPriorCostInput] = useState('');
  const [updatingPriorCost, setUpdatingPriorCost] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // History and prices are loaded once per open panel.
  const historyRef = useRef<Promise<{ family: ItemHistory[]; prices: Map<string, number> }> | null>(null);

  const speech = useSpeechInput((text) => send(text));

  useEffect(() => {
    if (userId && selectedListId) {
      setMessages([{ text: 'שלום! כתבו או אמרו מה צריך — "תוסיף 2 חלב", "פסטה בולונז ל-4", "מה חסר?" — ואציע שינויים לרשימה. שום דבר לא משתנה בלי אישור שלכם.', isUser: false }]);
      setMessage('');
      historyRef.current = null;
    }
  }, [userId, selectedListId]);

  useEffect(() => {
    setPriorCostInput(priorListTotalCost != null ? String(priorListTotalCost) : '');
  }, [priorListTotalCost]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, thinking]);

  const loadContext = () => {
    if (!userId) return Promise.resolve({ family: [], prices: new Map<string, number>() });
    historyRef.current ??= (async () => {
      const { items } = await loadPurchaseHistory(userId);
      const family = Array.from(items.values())
        .sort((a, b) => b.days.length - a.days.length || a.daysSinceLast - b.daysSinceLast)
        .slice(0, FAMILY_CONTEXT_SIZE);
      const names = Array.from(new Set([...family.map((f) => f.name), ...currentListItems.map((i) => i.name)]));
      const prices = await getItemAveragePrices(userId, names).catch(() => new Map<string, number>());
      return { family, prices };
    })();
    return historyRef.current;
  };

  const push = (m: Message) => setMessages((prev) => [...prev, m]);

  const send = async (text: string) => {
    const userMessage = text.trim();
    if (!userMessage || !userId || !selectedListId || thinking) return;
    push({ text: userMessage, isUser: true });
    setMessage('');
    setThinking(true);
    try {
      const { family, prices } = await loadContext();
      // Earlier proposals not applied yet still count, so they aren't proposed twice.
      const planned = messages.flatMap((m) => (m.proposal && !m.applied
        ? m.proposal.add.filter((a) => !m.off?.has(`add:${a.name}`)).map((a) => a.name)
        : []));
      const res = await fetch('/api/list-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          userId,
          message: userMessage,
          planned,
          list: currentListItems.map((i) => ({
            name: i.name,
            qty: i.quantity,
            price: i.estimated_price ?? prices.get(i.name) ?? null,
          })),
          family: family.map((f) => ({
            name: f.name, qty: f.typicalQty, every: f.typicalIntervalDays, ago: f.daysSinceLast,
            times: f.days.length, price: prices.get(f.name) ?? null,
          })),
        }),
      });
      const json = await res.json().catch(() => ({ success: false, error: `שגיאת שרת (${res.status})` }));
      if (!json.success) throw new Error(json.error || 'שגיאה');
      const proposal: Proposal = { add: json.data.add, remove: json.data.remove, setQty: json.data.setQty };
      push({ text: json.data.answer || 'הנה ההצעה שלי:', isUser: false, proposal: proposalSize(proposal) ? proposal : undefined, off: new Set() });
    } catch (err) {
      const msg = err instanceof DOMException ? 'העוזר לא ענה בזמן. נסו שוב.' : err instanceof Error ? err.message : 'שגיאה';
      push({ text: `⚠️ ${msg}`, isUser: false });
    } finally {
      setThinking(false);
    }
  };

  /** Free, instant: due items + staples from history, at their usual quantities. */
  const buildFromHistory = async () => {
    if (!userId) return;
    push({ text: 'בנה לי רשימה', isUser: true });
    setThinking(true);
    try {
      const s = await getListSuggestions(userId, currentListItems.map((i) => i.name));
      // A full list starts from what's bought regularly; rarer "due" items stay in the rail.
      const add = [...s.due.filter((x) => x.timesBought >= 3), ...s.staple]
        .map((x) => ({ name: x.name, qty: x.typicalQty, why: x.reason }));
      push(add.length
        ? { text: `לפי ההיסטוריה שלכם, אלה ${add.length} פריטים שכנראה צריך. הורידו סימון ממה שלא צריך:`, isUser: false, proposal: { add, remove: [], setQty: [] }, off: new Set(), offerImprove: true }
        : { text: 'אין עדיין מספיק היסטוריה כדי לבנות רשימה. נסו "מה חסר?" או ספרו לי מה מתכננים לבשל.', isUser: false });
    } catch {
      push({ text: '⚠️ לא הצלחתי לטעון את ההיסטוריה. נסו שוב.', isUser: false });
    } finally {
      setThinking(false);
    }
  };

  const toggle = (idx: number, key: string) => {
    setMessages((prev) => prev.map((m, i) => {
      if (i !== idx) return m;
      const off = new Set(m.off);
      if (off.has(key)) off.delete(key); else off.add(key);
      return { ...m, off };
    }));
  };

  const apply = async (idx: number) => {
    const m = messages[idx];
    if (!m.proposal || !selectedListId || !userId) return;
    const off = m.off ?? new Set<string>();
    const byName = new Map(currentListItems.map((i) => [normalizeItemName(i.name), i]));
    setApplyingIdx(idx);
    let done = 0;
    let failed = 0;
    try {
      const { family, prices } = await loadContext();
      const familyByName = new Map(family.map((f) => [normalizeItemName(f.name), f]));
      const tasks: Promise<unknown>[] = [];

      for (const a of m.proposal.add) {
        if (off.has(`add:${a.name}`)) continue;
        const existing = byName.get(normalizeItemName(a.name));
        if (existing) {
          tasks.push(updateGroceryItem(existing.id, { quantity: existing.quantity + a.qty }));
          continue;
        }
        tasks.push((async () => {
          const known = familyByName.get(normalizeItemName(a.name))?.category;
          const category = known && known !== 'ללא קטגוריה'
            ? known
            : (await suggestCategory(a.name, userId).catch(() => null))?.category ?? 'ללא קטגוריה';
          const price = prices.get(a.name) ?? (await getItemAveragePrices(userId, [a.name]).catch(() => new Map<string, number>())).get(a.name) ?? null;
          await createGroceryItem(selectedListId, a.name, a.qty, category, null, price);
        })());
      }
      for (const name of m.proposal.remove) {
        const item = byName.get(normalizeItemName(name));
        if (item && !off.has(`remove:${name}`)) tasks.push(deleteGroceryItem(item.id));
      }
      for (const s of m.proposal.setQty) {
        const item = byName.get(normalizeItemName(s.name));
        if (item && !off.has(`qty:${s.name}`)) tasks.push(updateGroceryItem(item.id, { quantity: s.qty }));
      }

      const results = await Promise.allSettled(tasks);
      done = results.filter((r) => r.status === 'fulfilled').length;
      failed = results.length - done;
      setMessages((prev) => prev.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
      onItemsAdded?.();
      if (failed) toast.error(`${failed} שינויים נכשלו`);
      else toast.success(`עודכנו ${done} פריטים ברשימה`);
    } finally {
      setApplyingIdx(null);
    }
  };

  const handleSavePriorCost = async () => {
    if (!priorListId || !userId) return;
    const parsed = priorCostInput.trim() ? parseFloat(priorCostInput.replace(/,/g, '.')) : null;
    const value = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
    setUpdatingPriorCost(true);
    try {
      await updateListTotalCost(priorListId, userId, value);
      onPriorListCostUpdated?.();
      toast.success(t.save);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUpdatingPriorCost(false);
    }
  };

  const onQuickAction = (a: (typeof QUICK_ACTIONS)[number]) => {
    if (a.send) return send(a.send);
    if (a.prefill) {
      setMessage(a.prefill);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    return buildFromHistory();
  };

  const proposalLine = (idx: number, m: Message, key: string, content: React.ReactNode, tone: 'add' | 'remove' | 'qty') => {
    const on = !m.off?.has(key);
    const toneClass = tone === 'remove' ? 'text-red-700 dark:text-red-300' : tone === 'qty' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100';
    return (
      <label key={key} className={`flex items-center gap-2 min-h-[36px] px-2 rounded-md cursor-pointer hover:bg-white/60 dark:hover:bg-slate-600/40 ${on ? '' : 'opacity-50'}`}>
        <input
          type="checkbox"
          checked={on}
          disabled={m.applied || applyingIdx === idx}
          onChange={() => toggle(idx, key)}
          className="h-4 w-4 accent-purple-600"
        />
        <span className={`text-sm flex-1 ${toneClass}`}>{content}</span>
      </label>
    );
  };

  return (
    <Card className="fixed bottom-24 left-3 right-3 sm:left-6 sm:right-auto sm:w-96 max-w-[calc(100vw-1.5rem)] shadow-2xl border-slate-200 bg-white dark:bg-slate-900 z-50 [dir=rtl]:left-auto [dir=rtl]:right-3 sm:[dir=rtl]:right-6 [dir=rtl]:sm:left-auto" style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
          <CardTitle className="text-base sm:text-lg text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-purple-600" /> עוזר רשימת קניות
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0" aria-label="סגור">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Prior list: update total cost */}
        {priorListId && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2 text-right">
              {t.priorListCostUpdate}
            </p>
            <div className="flex gap-2 items-center [dir=rtl]:flex-row-reverse">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder={t.totalCost}
                value={priorCostInput}
                onChange={(e) => setPriorCostInput(e.target.value)}
                className="w-24 text-right"
              />
              <Button variant="outline" size="sm" onClick={handleSavePriorCost} disabled={updatingPriorCost}>
                {updatingPriorCost && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {t.save}
              </Button>
            </div>
          </div>
        )}

        {/* Conversation */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 min-h-[150px] max-h-[45vh] overflow-y-auto space-y-2">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-2 rounded-lg text-sm ${
                msg.isUser
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 me-8'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 ms-8'
              }`}
            >
              <p className="whitespace-pre-line">{msg.text}</p>
              {msg.proposal && (
                <div className="mt-2 space-y-0.5">
                  {msg.proposal.add.map((a) => proposalLine(idx, msg, `add:${a.name}`, (
                    <>➕ {a.name}{a.qty > 1 && <b className="ms-1">×{a.qty}</b>}{a.why && <span className="ms-1.5 text-[11px] text-slate-500 dark:text-slate-400">{a.why}</span>}</>
                  ), 'add'))}
                  {msg.proposal.setQty.map((s) => proposalLine(idx, msg, `qty:${s.name}`, <>✏️ {s.name} → ×{s.qty}</>, 'qty'))}
                  {msg.proposal.remove.map((n) => proposalLine(idx, msg, `remove:${n}`, <>➖ להוריד: {n}</>, 'remove'))}
                  {msg.applied ? (
                    <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 pt-1"><Check className="h-3.5 w-3.5" /> עודכן ברשימה</p>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => apply(idx)}
                      disabled={applyingIdx !== null || proposalSize(msg.proposal) === (msg.off?.size ?? 0)}
                      className="w-full mt-1.5 bg-purple-600 hover:bg-purple-700 text-white min-h-[40px]"
                    >
                      {applyingIdx === idx
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : `✓ עדכן רשימה (${proposalSize(msg.proposal) - (msg.off?.size ?? 0)})`}
                    </Button>
                  )}
                  {msg.offerImprove && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => send('מה עוד כדאי להוסיף? חשוב על השלמות לפריטים שברשימה ועל דברים שנשכחים בדרך כלל.')}
                      disabled={thinking}
                      className="w-full mt-1 min-h-[36px]"
                    >
                      ✨ שפר עם AI
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 p-2">
              <Loader2 className="h-4 w-4 animate-spin text-purple-600" /> חושב…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Quick actions */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onQuickAction(a)}
              disabled={thinking}
              className="flex-shrink-0 rounded-full border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 text-xs px-3 min-h-[34px] whitespace-nowrap disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); send(message); }}
        >
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={speech.listening ? 'מקשיב…' : 'מה צריך?'}
            className="flex-1 text-right"
            maxLength={400}
            disabled={thinking}
          />
          {speech.supported && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={speech.listening ? speech.stop : speech.start}
              aria-label={speech.listening ? 'הפסק הקלטה' : 'דבר אל העוזר'}
              className={speech.listening ? 'border-red-400 text-red-600 animate-pulse' : ''}
              disabled={thinking}
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}
          <Button type="submit" size="icon" disabled={thinking || !message.trim()} aria-label="שלח" className="bg-purple-600 hover:bg-purple-700 text-white">
            <Send className="h-4 w-4 [dir=rtl]:rotate-180" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
