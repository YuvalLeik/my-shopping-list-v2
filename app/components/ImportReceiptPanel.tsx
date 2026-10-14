'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Loader2, ClipboardPaste, FileText, Camera, Trash2, Plus, Check, AlertCircle, Search, Image as ImageIcon, Link2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { t } from '@/lib/translations';
import type { ParsedReceipt, ParsedItem } from '@/lib/receiptParser';
import { GroceryList } from '@/lib/groceryLists';
import { upsertAlias, getUserPersonalItems, PersonalItem } from '@/lib/itemAliases';
import { matchParsedReceipt, ReceiptMatch, AUTO_ACCEPT_CONFIDENCE } from '@/lib/receiptMatch';
import { recordPrices } from '@/lib/itemPrices';
import { autoMatchPurchaseToGroceryItems } from '@/lib/purchaseRecords';
import { uploadReceiptImage } from '@/lib/storage';
import { upsertUserItemBarcode } from '@/lib/userItemBarcodes';
import { compressImage } from '@/lib/imageCompress';
import { supabase } from '@/lib/supabase';

interface ImportReceiptPanelProps {
  userId: string;
  preselectedListId?: string | null;
  /** The list being built/shopped now: a fresh receipt usually belongs to it. */
  activeListId?: string | null;
  completedLists?: GroceryList[];
  /** Files shared into the app (Android share sheet). */
  initialFiles?: File[];
  /** A receipt link shared into the app. */
  initialLink?: string;
  onClose: () => void;
  onRecordSaved: () => void;
}

type Tab = 'file' | 'link' | 'paste';
type Step = 'input' | 'matching' | 'parsed' | 'saving';
type ParseResponse = ParsedReceipt & { rawText?: string; parserUsed?: string; parserError?: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

export function ImportReceiptPanel({
  userId,
  preselectedListId = null,
  activeListId = null,
  completedLists = [],
  initialFiles,
  initialLink,
  onClose,
  onRecordSaved,
}: ImportReceiptPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialLink ? 'link' : 'file');
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [linkText, setLinkText] = useState(initialLink ?? '');

  // Parsed results (editable). parsedItems[i] and matchedItems[i] describe the same line.
  const [parsedStoreName, setParsedStoreName] = useState('');
  const [parsedDate, setParsedDate] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parsedTotal, setParsedTotal] = useState('');
  const [totalMismatch, setTotalMismatch] = useState<number | null>(null);
  const [rawText, setRawText] = useState('');
  const [source, setSource] = useState<'copy_paste' | 'pdf_upload' | 'photo_ocr'>('pdf_upload');
  const [linkedListId, setLinkedListId] = useState<string | null>(preselectedListId);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [matchedItems, setMatchedItems] = useState<ReceiptMatch[]>([]);
  const [showAllLines, setShowAllLines] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Long paper receipts are photographed in overlapping segments, sent together.
  const [photoSegments, setPhotoSegments] = useState<{ file: File; url: string }[]>([]);

  // Personal items: matching candidates and the manual "attach" picker.
  const [personalItems, setPersonalItems] = useState<PersonalItem[]>([]);
  const [searchingItemIdx, setSearchingItemIdx] = useState<number | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  const loadPersonalItems = useCallback(async () => {
    setPersonalItems(await getUserPersonalItems(userId));
  }, [userId]);

  useEffect(() => { loadPersonalItems(); }, [loadPersonalItems]);

  useEffect(() => {
    return () => { photoSegments.forEach((s) => URL.revokeObjectURL(s.url)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Names the parser may map receipt lines onto (open list first). */
  const candidateNames = async (): Promise<string[]> => {
    const names: string[] = [];
    const listId = linkedListId || activeListId;
    if (listId) {
      const { data } = await supabase.from('grocery_items').select('name').eq('list_id', listId);
      for (const r of data || []) names.push(r.name);
    }
    const items = personalItems.length ? personalItems : await getUserPersonalItems(userId);
    for (const p of items) names.push(p.name);
    return Array.from(new Set(names)).slice(0, 200);
  };

  /** Pick the list this receipt most likely belongs to (by overlapping items). */
  const guessList = async (matches: ReceiptMatch[]): Promise<string | null> => {
    const ids = Array.from(new Set([activeListId, ...completedLists.slice(0, 5).map((l) => l.id)].filter(Boolean))) as string[];
    if (!ids.length) return null;
    const { data } = await supabase.from('grocery_items').select('list_id, name').in('list_id', ids);
    const bought = new Set(matches.map((m) => m.matchedCanonicalName).filter(Boolean).map((n) => norm(n!)));
    const score = new Map<string, number>();
    for (const r of data || []) if (bought.has(norm(r.name))) score.set(r.list_id, (score.get(r.list_id) ?? 0) + 1);
    const best = Array.from(score.entries()).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 3 ? best[0] : null;
  };

  const isDoubtful = (m: ReceiptMatch) =>
    !m.isBag && !!m.matchedCanonicalName && !m.isConfirmed && m.confidence < AUTO_ACCEPT_CONFIDENCE;

  /** Shared tail of every input path: fill the form, match, and auto-save when nothing is doubtful. */
  const handleParsed = async (data: ParseResponse) => {
    setRawText(data.rawText || '');
    setParsedStoreName(data.storeName || '');
    setParsedDate(data.purchaseDate || '');
    setParsedItems(data.items);
    setParsedTotal(data.totalAmount != null ? String(data.totalAmount) : '');
    setTotalMismatch(data.totalMismatch ?? null);

    if (data.parserUsed === 'regex' || data.parserUsed === 'vision_failed') {
      toast.warning(t.receiptParserFallback, { description: data.parserError || undefined });
    }
    if (data.items.length === 0) {
      toast.info(t.receiptNoItemsFound);
      setStep('parsed');
      return;
    }

    setStep('matching');
    let matches: ReceiptMatch[] = [];
    try {
      matches = await matchParsedReceipt(userId, data.items, { aiProposedMatches: data.parserUsed === 'gemini' });
    } catch { /* show unmatched */ }
    setMatchedItems(matches);

    let listId = linkedListId;
    if (!listId && matches.length) {
      listId = await guessList(matches).catch(() => null);
      if (listId) setLinkedListId(listId);
    }

    const mismatchTooBig = data.totalAmount != null && data.totalMismatch != null
      && Math.abs(data.totalMismatch) > data.totalAmount * 0.02;
    if (matches.length && !matches.some(isDoubtful) && !mismatchTooBig && data.parserUsed === 'gemini') {
      await save({
        items: data.items, matches, listId,
        storeName: data.storeName || '', date: data.purchaseDate || '',
        total: data.totalAmount, rawText: data.rawText || '',
      });
      return;
    }
    setStep('parsed');
  };

  const postForm = async (formData: FormData): Promise<ParseResponse> => {
    formData.append('userId', userId);
    formData.append('candidates', JSON.stringify(await candidateNames()));
    const res = await fetch('/api/receipt-parse', { method: 'POST', body: formData });
    const json = await res.json().catch(() => ({ success: false, error: `שגיאת שרת (${res.status})` }));
    if (!json.success) throw new Error(json.error || 'Parse failed');
    return json.data;
  };

  /** PDF → parsed directly. Images → resized, then parsed together as segments of one receipt. */
  const analyzeFiles = async (files: File[]) => {
    if (!files.length) return;
    setLoading(true);
    try {
      const pdf = files.find(isPdf);
      const formData = new FormData();
      if (pdf) {
        setSource('pdf_upload');
        formData.append('file', pdf);
      } else {
        setSource('photo_ocr');
        const images = await Promise.all(files.slice(0, 6).map((f) => compressImage(f)));
        uploadReceiptImage(images[0], userId).then(({ publicUrl }) => setReceiptImageUrl(publicUrl)).catch(() => {});
        for (const img of images) formData.append('file', img);
      }
      await handleParsed(await postForm(formData));
      photoSegments.forEach((s) => URL.revokeObjectURL(s.url));
      setPhotoSegments([]);
    } catch (err) {
      toast.error(t.receiptParseFailed, { description: err instanceof Error ? err.message : 'Unknown error' });
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.some(isPdf) || files.length > 1) {
      analyzeFiles(files);
      return;
    }
    // A single photo: keep it as a segment so more parts can be added.
    addSegments(files);
  };

  const addSegments = (files: File[]) => {
    setPhotoSegments((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 6));
  };

  const removeSegment = (index: number) => {
    setPhotoSegments((prev) => {
      const seg = prev[index];
      if (seg) URL.revokeObjectURL(seg.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleLinkSubmit = async (value = linkText) => {
    if (!/https:\/\//.test(value)) {
      toast.error('הדביקו קישור לקבלה (מתחיל ב-https://)');
      return;
    }
    setLoading(true);
    setSource('pdf_upload');
    try {
      const res = await fetch('/api/receipt-from-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, candidates: await candidateNames() }),
      });
      const json = await res.json().catch(() => ({ success: false, error: `שגיאת שרת (${res.status})` }));
      if (!json.success) throw new Error(json.error || 'Link failed');
      await handleParsed(json.data);
    } catch (err) {
      toast.error('לא הצלחתי לקרוא את הקבלה מהקישור', {
        description: err instanceof Error ? err.message : undefined,
        duration: 8000,
      });
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) {
      toast.error(t.receiptPasteEmpty);
      return;
    }
    if (/^\s*https:\/\/\S+\s*$/.test(pasteText)) {
      setLinkText(pasteText.trim());
      setActiveTab('link');
      return handleLinkSubmit(pasteText.trim());
    }
    setLoading(true);
    setSource('copy_paste');
    try {
      const res = await fetch('/api/receipt-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: pasteText, candidates: await candidateNames() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Parse failed');
      await handleParsed(json.data);
    } catch (err) {
      toast.error(t.receiptParseFailed, { description: err instanceof Error ? err.message : 'Unknown error' });
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  // Shared files / links from the Android share sheet start immediately.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    if (initialFiles?.length) { startedRef.current = true; analyzeFiles(initialFiles); }
    else if (initialLink) { startedRef.current = true; handleLinkSubmit(initialLink); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (args: {
    items: ParsedItem[];
    matches: ReceiptMatch[];
    listId: string | null;
    storeName: string;
    date: string;
    total: number | null;
    rawText: string;
  }) => {
    setSaving(true);
    setStep('saving');
    try {
      const lines = args.items.map((item, i) => ({ item, match: args.matches[i] }));
      const finalItems = lines.map(({ item, match }) => ({
        name: match?.matchedCanonicalName || item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }));

      const res = await fetch('/api/purchase-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          groceryListId: args.listId,
          storeName: args.storeName || null,
          purchaseDate: args.date || null,
          totalAmount: args.total,
          source,
          receiptImageUrl,
          rawText: args.rawText,
          items: finalItems,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      const purchaseRecordId = json.data?.id || null;

      let markedOnList = 0;
      if (purchaseRecordId && args.listId) {
        markedOnList = await autoMatchPurchaseToGroceryItems(purchaseRecordId, args.listId).catch(() => 0);
      }

      // Learn: receipt name → item (alias) and barcode → item, so the next
      // receipt matches instantly. Only real product barcodes (7+ digits):
      // short codes are store-specific produce numbers.
      const learning: Promise<unknown>[] = [];
      for (const { item, match } of lines) {
        if (!match?.matchedCanonicalName || match.isBag) continue;
        const accepted = match.isConfirmed || match.confidence >= AUTO_ACCEPT_CONFIDENCE;
        if (accepted && match.source !== 'alias') {
          learning.push(upsertAlias(userId, item.name, match.matchedCanonicalName, args.storeName || null).catch(() => {}));
        }
        if (accepted && item.barcode && item.barcode.length >= 7) {
          learning.push(upsertUserItemBarcode(userId, match.matchedCanonicalName, item.barcode, 'receipt').catch(() => {}));
        }
      }
      await Promise.all(learning);

      const priceItems = finalItems
        .filter((i, idx) => i.totalPrice != null && i.totalPrice > 0 && !lines[idx].item.isBag)
        .map((i) => ({
          itemName: i.name,
          storeName: args.storeName || null,
          price: i.totalPrice!,
          quantity: i.quantity ?? 1,
          unitPrice: i.unitPrice,
          purchaseDate: args.date || null,
          purchaseRecordId,
        }));
      if (priceItems.length > 0) await recordPrices(userId, priceItems).catch(() => {});

      const matchedCount = args.matches.filter((m) => m?.matchedCanonicalName).length;
      toast.success(t.receiptSaved, {
        description: `${args.items.length} שורות · ${matchedCount} שויכו לפריטים שלך${markedOnList ? ` · ${markedOnList} סומנו ברשימה` : ''}`,
        duration: 6000,
      });
      onRecordSaved();
      onClose();
    } catch (err) {
      toast.error(t.receiptSaveFailed, { description: err instanceof Error ? err.message : 'Unknown error' });
      setStep('parsed');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const totalVal = parsedTotal.trim() ? parseFloat(parsedTotal.replace(/,/g, '.')) : null;
    save({
      items: parsedItems,
      matches: matchedItems,
      listId: linkedListId,
      storeName: parsedStoreName,
      date: parsedDate,
      total: totalVal != null && !isNaN(totalVal) ? totalVal : null,
      rawText,
    });
  };

  const handleItemChange = (index: number, field: 'name' | 'quantity' | 'totalPrice', value: string) => {
    const n = parseFloat(value.replace(/,/g, '.'));
    setParsedItems((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      if (field === 'name') return { ...it, name: value };
      return { ...it, [field]: isNaN(n) ? (field === 'quantity' ? 1 : null) : n };
    }));
    setMatchedItems((prev) => prev.map((m, i) => {
      if (i !== index) return m;
      if (field === 'name') return { ...m, originalName: value };
      if (field === 'quantity') return { ...m, quantity: isNaN(n) ? 1 : n };
      return { ...m, totalPrice: isNaN(n) ? null : n };
    }));
  };

  const handleRemoveItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
    setMatchedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    setParsedItems((prev) => [...prev, { name: '', quantity: 1, unitPrice: null, totalPrice: null }]);
    setMatchedItems((prev) => [...prev, {
      originalName: '', matchedCanonicalName: null, matchedImageUrl: null, confidence: 0, isConfirmed: false,
      quantity: 1, unitPrice: null, totalPrice: null, source: 'none', barcode: null, isBag: false,
    }]);
    setShowAllLines(true);
  };

  const handleMatchAction = (index: number, action: 'approve' | 'reject' | 'change', newName?: string, imageUrl?: string | null) => {
    setMatchedItems((prev) => prev.map((m, i) => {
      if (i !== index) return m;
      if (action === 'approve') return { ...m, isConfirmed: true, confidence: 100 };
      if (action === 'reject') return { ...m, matchedCanonicalName: null, matchedImageUrl: null, confidence: 0, isConfirmed: false, source: 'none' };
      if (newName) return { ...m, matchedCanonicalName: newName, matchedImageUrl: imageUrl ?? null, confidence: 100, isConfirmed: true };
      return m;
    }));
  };

  const approveAllSuggestions = () => {
    setMatchedItems((prev) => prev.map((m) => (isDoubtful(m) ? { ...m, isConfirmed: true, confidence: 100 } : m)));
  };

  const handleBackToInput = () => {
    setStep('input');
    setParsedItems([]);
    setParsedStoreName('');
    setParsedDate('');
    setParsedTotal('');
    setTotalMismatch(null);
    setRawText('');
    setReceiptImageUrl(null);
    setMatchedItems([]);
    setShowAllLines(false);
  };

  const filteredPersonalItems = itemSearchQuery.trim()
    ? personalItems.filter((p) => p.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
    : personalItems;

  const getMatchIndicator = (m: ReceiptMatch) => {
    if (m.isBag) return { color: 'text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800', label: 'שקית/אריזה', icon: null };
    if (m.matchedCanonicalName && (m.isConfirmed || m.confidence >= AUTO_ACCEPT_CONFIDENCE)) {
      const label = m.source === 'barcode' ? 'לפי ברקוד' : m.source === 'ai' ? 'זוהה' : t.matchConfirmed;
      return { color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', label, icon: Check };
    }
    if (m.matchedCanonicalName) {
      return { color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'לבדוק', icon: AlertCircle };
    }
    return { color: 'text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800', label: 'פריט חדש', icon: null };
  };

  const doubtfulCount = matchedItems.filter(isDoubtful).length;
  // Review shows doubtful lines first; the rest stays folded unless asked for.
  const visibleIdx = parsedItems
    .map((_, i) => i)
    .filter((i) => showAllLines || !matchedItems[i] || isDoubtful(matchedItems[i]))
    .sort((a, b) => Number(!!matchedItems[b] && isDoubtful(matchedItems[b])) - Number(!!matchedItems[a] && isDoubtful(matchedItems[a])));
  const listOptions = [
    ...(activeListId && !completedLists.some((l) => l.id === activeListId) ? [{ id: activeListId, title: 'הרשימה הנוכחית', completed_at: null }] : []),
    ...completedLists,
  ];

  return (
    <Card className="fixed left-3 right-3 sm:left-6 sm:right-auto sm:w-[440px] max-w-[calc(100vw-1.5rem)] max-h-[80dvh] shadow-2xl border-slate-200 bg-white dark:bg-slate-900 z-[60] [dir=rtl]:left-auto [dir=rtl]:right-3 sm:[dir=rtl]:right-6 [dir=rtl]:sm:left-auto flex flex-col overflow-hidden" style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg text-slate-900 dark:text-slate-50">{t.importReceipt}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-9 w-9 p-0" aria-label={t.cancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 overflow-y-auto flex-1 pb-4">
        {step === 'input' && (
          <>
            <div className="flex gap-1">
              {([
                ['file', <Upload key="i" className="h-3.5 w-3.5 me-1" />, 'קובץ / צילום'],
                ['link', <Link2 key="i" className="h-3.5 w-3.5 me-1" />, 'קישור'],
                ['paste', <ClipboardPaste key="i" className="h-3.5 w-3.5 me-1" />, t.receiptTabPaste],
              ] as const).map(([tab, icon, label]) => (
                <Button
                  key={tab}
                  variant={activeTab === tab ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 text-xs min-h-[40px]"
                >
                  {icon}{label}
                </Button>
              ))}
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mb-2" />
                <span className="text-sm text-slate-700 dark:text-slate-300">קורא את הקבלה…</span>
                <span className="text-xs text-slate-400 mt-1">קבלה ארוכה יכולה לקחת עד דקה</span>
              </div>
            )}

            {!loading && activeTab === 'file' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  PDF של קבלה דיגיטלית, צילום מסך או צילום של קבלת נייר.
                </p>
                <input ref={fileInputRef} type="file" accept="application/pdf,.pdf,image/*" multiple onChange={handleFilesPicked} className="hidden" />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFilesPicked} className="hidden" />

                {photoSegments.length > 0 && (
                  <>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">💡 {t.receiptSegmentsTip}</p>
                    <div className="flex gap-2 overflow-x-auto py-1" dir="ltr">
                      {photoSegments.map((seg, idx) => (
                        <div key={seg.url} className="relative flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={seg.url} alt={t.receiptSegmentLabel(idx + 1)} className="h-24 w-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                          <span className="absolute bottom-0.5 left-0.5 text-[10px] font-bold bg-black/60 text-white rounded px-1">{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeSegment(idx)}
                            aria-label={t.delete}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => cameraInputRef.current?.click()} variant="outline" className="min-h-[48px]" disabled={photoSegments.length >= 6}>
                    <Camera className="h-4 w-4 me-2" />
                    {photoSegments.length === 0 ? 'צלם קבלה' : t.receiptAddSegment}
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="min-h-[48px]">
                    <FileText className="h-4 w-4 me-2" />
                    בחר קובץ
                  </Button>
                </div>
                {photoSegments.length > 0 && (
                  <Button onClick={() => analyzeFiles(photoSegments.map((s) => s.file))} className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white">
                    {t.receiptAnalyzeSegments(photoSegments.length)}
                  </Button>
                )}
                <p className="text-[11px] text-slate-400">
                  קיבלתם קבלה ב-SMS/וואטסאפ? באנדרואיד אפשר &quot;שתף&quot; ישר לאפליקציה. באייפון: הדביקו את הקישור בלשונית &quot;קישור&quot;, או שמרו את ה-PDF ובחרו אותו כאן.
                </p>
              </div>
            )}

            {!loading && activeTab === 'link' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  הדביקו את הקישור לקבלה הדיגיטלית (אפשר את כל ההודעה מהסופר).
                </p>
                <textarea
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-24 p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  dir="ltr"
                />
                <Button onClick={() => handleLinkSubmit()} disabled={!linkText.trim()} className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white">
                  קרא קבלה מהקישור
                </Button>
              </div>
            )}

            {!loading && activeTab === 'paste' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.receiptPasteHelp}</p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={t.receiptPastePlaceholder}
                  className="w-full h-40 p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  dir="rtl"
                />
                <Button onClick={handlePasteSubmit} disabled={!pasteText.trim()} className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white">
                  {t.receiptParseBtn}
                </Button>
              </div>
            )}
          </>
        )}

        {step === 'matching' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600 me-2" />
            <span className="text-sm text-slate-600 dark:text-slate-400">{t.matchingItems}</span>
          </div>
        )}

        {step === 'parsed' && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={handleBackToInput} className="text-xs">{t.receiptBackToInput}</Button>

            {/* Summary */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 text-xs space-y-1">
              <div className="font-medium text-slate-800 dark:text-slate-100">
                {parsedItems.length} שורות · {matchedItems.filter((m) => m.matchedCanonicalName && !isDoubtful(m)).length} שויכו
                {doubtfulCount > 0 && <span className="text-amber-600"> · {doubtfulCount} לבדיקה</span>}
              </div>
              {totalMismatch != null && parsedTotal && Math.abs(totalMismatch) > parseFloat(parsedTotal) * 0.02 && (
                <div className="text-amber-700 dark:text-amber-400">
                  ⚠️ סכום השורות שונה מסה״כ הקבלה ב-₪{Math.abs(totalMismatch).toFixed(2)}. כדאי לבדוק שלא חסרה שורה.
                </div>
              )}
              {doubtfulCount > 1 && (
                <button type="button" onClick={approveAllSuggestions} className="text-emerald-700 dark:text-emerald-400 font-medium min-h-[32px]">
                  ✓ אשר את כל ההצעות
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">{t.receiptStoreName}</label>
                <Input value={parsedStoreName} onChange={(e) => setParsedStoreName(e.target.value)} className="text-sm h-9" />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">{t.receiptDate}</label>
                <Input type="date" value={parsedDate} onChange={(e) => setParsedDate(e.target.value)} className="text-sm h-9" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {showAllLines || doubtfulCount === 0 ? `${t.receiptItems} (${parsedItems.length})` : `לבדיקה (${doubtfulCount})`}
                </label>
                <div className="flex gap-1">
                  {doubtfulCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setShowAllLines(!showAllLines)} className="h-7 text-xs">
                      {showAllLines ? 'רק לבדיקה' : `הצג הכל (${parsedItems.length})`}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleAddItem} className="h-7 text-xs">
                    <Plus className="h-3 w-3 me-1" />{t.add}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {(doubtfulCount === 0 && !showAllLines ? parsedItems.map((_, i) => i) : visibleIdx).map((idx) => {
                  const item = parsedItems[idx];
                  const match = matchedItems[idx];
                  const indicator = match ? getMatchIndicator(match) : null;
                  return (
                    <div key={idx} className={`rounded p-1.5 space-y-1 ${indicator?.bg || 'bg-slate-50 dark:bg-slate-800'}`}>
                      {match && (
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            {match.matchedImageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={match.matchedImageUrl} alt="" className="h-5 w-5 rounded object-cover flex-shrink-0" />
                            )}
                            {indicator?.icon && <indicator.icon className={`h-3 w-3 flex-shrink-0 ${indicator.color}`} />}
                            <span className={`text-[10px] font-medium ${indicator?.color}`}>{indicator?.label}</span>
                            {match.matchedCanonicalName && (
                              <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate">→ {match.matchedCanonicalName}</span>
                            )}
                          </div>
                          <div className="flex gap-0.5 flex-shrink-0">
                            {match.matchedCanonicalName && !match.isConfirmed && (
                              <Button variant="ghost" size="sm" onClick={() => handleMatchAction(idx, 'approve')} className="h-7 w-7 p-0 text-green-600 hover:bg-green-100" title={t.approveMatch}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {!match.isBag && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSearchingItemIdx(searchingItemIdx === idx ? null : idx); setItemSearchQuery(''); }}
                                className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-100"
                                title={t.attachItem}
                              >
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {match.matchedCanonicalName && (
                              <Button variant="ghost" size="sm" onClick={() => handleMatchAction(idx, 'reject')} className="h-7 w-7 p-0 text-red-500 hover:bg-red-100" title={t.rejectMatch}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      {searchingItemIdx === idx && (
                        <div className="space-y-1">
                          <Input
                            value={itemSearchQuery}
                            onChange={(e) => setItemSearchQuery(e.target.value)}
                            placeholder={t.searchMyItems}
                            className="text-xs h-8"
                            autoFocus
                          />
                          <div className="max-h-28 overflow-y-auto space-y-0.5 border rounded bg-white dark:bg-slate-900 p-1">
                            {filteredPersonalItems.slice(0, 12).map((pi, piIdx) => (
                              <button
                                key={piIdx}
                                type="button"
                                className="flex items-center gap-1.5 w-full text-start text-xs px-1.5 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                                onClick={() => { handleMatchAction(idx, 'change', pi.name, pi.image_url); setSearchingItemIdx(null); }}
                              >
                                {pi.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={pi.image_url} alt="" className="h-5 w-5 rounded object-cover flex-shrink-0" />
                                ) : (
                                  <ImageIcon className="h-4 w-4 text-slate-300 flex-shrink-0" />
                                )}
                                <span className="truncate">{pi.name}</span>
                              </button>
                            ))}
                            {filteredPersonalItems.length === 0 && <p className="text-[10px] text-slate-400 text-center py-1">{t.noMatch}</p>}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-1 items-center">
                        <Input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} placeholder={t.itemName} className="flex-1 text-xs h-8" />
                        <Input type="number" value={item.quantity ?? ''} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} placeholder={t.receiptQty} className="w-14 text-xs h-8 text-center" step="0.01" title={item.weighed ? 'ק״ג' : t.receiptQty} />
                        <Input type="number" value={item.totalPrice ?? ''} onChange={(e) => handleItemChange(idx, 'totalPrice', e.target.value)} placeholder="₪" className="w-16 text-xs h-8 text-center" step="0.01" />
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(idx)} className="h-8 w-8 p-0 text-red-500 flex-shrink-0" aria-label={t.delete}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {parsedItems.length === 0 && <p className="text-xs text-slate-400 text-center py-3">{t.receiptNoItemsFound}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">{t.receiptTotal} (₪)</label>
                <Input type="number" value={parsedTotal} onChange={(e) => setParsedTotal(e.target.value)} className="text-sm h-9" step="0.01" />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">{t.receiptLinkToList}</label>
                <select
                  value={linkedListId || ''}
                  onChange={(e) => setLinkedListId(e.target.value || null)}
                  className="w-full h-9 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800"
                  dir="rtl"
                >
                  <option value="">{t.receiptStandalone}</option>
                  {listOptions.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title} {list.completed_at ? `(${new Date(list.completed_at).toLocaleDateString('he-IL')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving || parsedItems.length === 0} className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{t.receiptSaving}</> : t.receiptSaveBtn}
            </Button>
          </div>
        )}

        {step === 'saving' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600 me-2" />
            <span className="text-sm text-slate-600 dark:text-slate-400">{t.receiptSaving}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
