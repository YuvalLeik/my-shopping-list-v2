'use client';

import { useState, useRef } from 'react';
import { X, Loader2, ClipboardPaste, FileText, Camera, Trash2, Plus, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { t } from '@/lib/translations';
import type { ParsedReceipt, ParsedItem } from '@/lib/receiptParser';
import { GroceryList } from '@/lib/groceryLists';
import { matchReceiptItems, upsertAlias, MatchedItem } from '@/lib/itemAliases';
import { recordPrices } from '@/lib/itemPrices';

interface ImportReceiptPanelProps {
  userId: string;
  preselectedListId?: string | null;
  completedLists?: GroceryList[];
  onClose: () => void;
  onRecordSaved: () => void;
}

type Tab = 'paste' | 'pdf' | 'photo';
type Step = 'input' | 'matching' | 'parsed' | 'saving';

export function ImportReceiptPanel({
  userId,
  preselectedListId = null,
  completedLists = [],
  onClose,
  onRecordSaved,
}: ImportReceiptPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('paste');
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Input state
  const [pasteText, setPasteText] = useState('');

  // Parsed results (editable)
  const [parsedStoreName, setParsedStoreName] = useState('');
  const [parsedDate, setParsedDate] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parsedTotal, setParsedTotal] = useState('');
  const [rawText, setRawText] = useState('');
  const [source, setSource] = useState<'copy_paste' | 'pdf_upload' | 'photo_ocr'>('copy_paste');
  const [linkedListId, setLinkedListId] = useState<string | null>(preselectedListId);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);

  // Matching state
  const [matchedItems, setMatchedItems] = useState<MatchedItem[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);

  // PDF/Photo refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const runMatching = async (items: ParsedItem[], storeName: string) => {
    setMatchingLoading(true);
    setStep('matching');
    try {
      const matched = await matchReceiptItems(
        userId,
        items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
        })),
        storeName || null
      );
      setMatchedItems(matched);
      setStep('parsed');
    } catch {
      setMatchedItems([]);
      setStep('parsed');
    } finally {
      setMatchingLoading(false);
    }
  };

  const handleParse = async (text: string, src: 'copy_paste' | 'pdf_upload' | 'photo_ocr') => {
    setLoading(true);
    setRawText(text);
    setSource(src);
    try {
      const res = await fetch('/api/receipt-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Parse failed');

      const data = json.data as ParsedReceipt & { parserUsed?: string; parserError?: string };
      setParsedStoreName(data.storeName || '');
      setParsedDate(data.purchaseDate || '');
      setParsedItems(data.items);
      setParsedTotal(data.totalAmount != null ? String(data.totalAmount) : '');

      if (data.parserUsed === 'regex' || data.parserUsed === 'vision_failed') {
        toast.warning(t.receiptParserFallback, {
          description: data.parserError || undefined,
        });
      }
      if (data.items.length === 0) {
        toast.info(t.receiptNoItemsFound);
        setStep('parsed');
      } else {
        await runMatching(data.items, data.storeName || '');
      }
    } catch (err) {
      toast.error(t.receiptParseFailed, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) {
      toast.error(t.receiptPasteEmpty);
      return;
    }
    handleParse(pasteText, 'copy_paste');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, src: 'pdf_upload' | 'photo_ocr') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setSource(src);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      const res = await fetch('/api/receipt-parse', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Parse failed');

      const data = json.data as ParsedReceipt & { rawText?: string; parserUsed?: string; parserError?: string };
      setRawText(data.rawText || '');
      setParsedStoreName(data.storeName || '');
      setParsedDate(data.purchaseDate || '');
      setParsedItems(data.items);
      setParsedTotal(data.totalAmount != null ? String(data.totalAmount) : '');

      if (data.parserUsed === 'regex' || data.parserUsed === 'vision_failed') {
        toast.warning(t.receiptParserFallback, {
          description: data.parserError || undefined,
        });
      }
      if (data.items.length === 0) {
        toast.info(t.receiptNoItemsFound);
        setStep('parsed');
      } else {
        await runMatching(data.items, data.storeName || '');
      }
    } catch (err) {
      const errMsg = src === 'photo_ocr' ? t.receiptOcrFailed : t.receiptParseFailed;
      toast.error(errMsg, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
      const ref = src === 'pdf_upload' ? fileInputRef : photoInputRef;
      if (ref.current) ref.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStep('saving');
    try {
      const totalVal = parsedTotal.trim() ? parseFloat(parsedTotal.replace(/,/g, '.')) : null;

      // Build the final items using matched canonical names where available
      const finalItems = matchedItems.length > 0
        ? matchedItems.map(m => ({
            name: m.matchedCanonicalName || m.originalName,
            quantity: m.quantity,
            unitPrice: m.unitPrice,
            totalPrice: m.totalPrice,
          }))
        : parsedItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          }));

      const res = await fetch('/api/purchase-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          groceryListId: linkedListId,
          storeName: parsedStoreName || null,
          purchaseDate: parsedDate || null,
          totalAmount: totalVal != null && !isNaN(totalVal) ? totalVal : null,
          source,
          receiptImageUrl,
          rawText,
          items: finalItems,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');

      const purchaseRecordId = json.data?.id || null;

      // Save aliases for confirmed matches
      for (const m of matchedItems) {
        if (m.matchedCanonicalName && m.confidence >= 50) {
          try {
            await upsertAlias(userId, m.originalName, m.matchedCanonicalName, parsedStoreName || null);
          } catch { /* ignore alias save failure */ }
        }
      }

      // Record prices for all items that have price data
      const priceItems = finalItems
        .filter(i => (i.totalPrice != null && i.totalPrice > 0))
        .map(i => ({
          itemName: i.name,
          storeName: parsedStoreName || null,
          price: i.totalPrice!,
          quantity: i.quantity ?? 1,
          unitPrice: i.unitPrice,
          purchaseDate: parsedDate || null,
          purchaseRecordId,
        }));

      if (priceItems.length > 0) {
        try {
          await recordPrices(userId, priceItems);
        } catch { /* ignore price record failure */ }
      }

      toast.success(t.receiptSaved);
      onRecordSaved();
      onClose();
    } catch (err) {
      toast.error(t.receiptSaveFailed, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
      setStep('parsed');
    } finally {
      setSaving(false);
    }
  };

  const handleItemChange = (index: number, field: keyof ParsedItem, value: string) => {
    setParsedItems(prev => {
      const updated = [...prev];
      if (field === 'name') {
        updated[index] = { ...updated[index], name: value };
      } else {
        const num = parseFloat(value.replace(/,/g, '.'));
        updated[index] = { ...updated[index], [field]: isNaN(num) ? null : num };
      }
      return updated;
    });
    // Also update matched items if they exist
    if (matchedItems.length > index) {
      setMatchedItems(prev => {
        const updated = [...prev];
        if (field === 'name') {
          updated[index] = { ...updated[index], originalName: value };
        } else {
          const num = parseFloat(value.replace(/,/g, '.'));
          if (field === 'quantity') updated[index] = { ...updated[index], quantity: isNaN(num) ? 1 : num };
          else if (field === 'unitPrice') updated[index] = { ...updated[index], unitPrice: isNaN(num) ? null : num };
          else if (field === 'totalPrice') updated[index] = { ...updated[index], totalPrice: isNaN(num) ? null : num };
        }
        return updated;
      });
    }
  };

  const handleRemoveItem = (index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
    setMatchedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    setParsedItems(prev => [
      ...prev,
      { name: '', quantity: 1, unitPrice: null, totalPrice: null },
    ]);
    setMatchedItems(prev => [
      ...prev,
      { originalName: '', matchedCanonicalName: null, confidence: 0, isConfirmed: false, quantity: 1, unitPrice: null, totalPrice: null },
    ]);
  };

  const handleMatchAction = (index: number, action: 'approve' | 'reject' | 'change', newName?: string) => {
    setMatchedItems(prev => {
      const updated = [...prev];
      if (action === 'approve') {
        updated[index] = { ...updated[index], isConfirmed: true, confidence: 100 };
      } else if (action === 'reject') {
        updated[index] = { ...updated[index], matchedCanonicalName: null, confidence: 0, isConfirmed: false };
      } else if (action === 'change' && newName) {
        updated[index] = { ...updated[index], matchedCanonicalName: newName, confidence: 100, isConfirmed: true };
      }
      return updated;
    });
  };

  const handleBackToInput = () => {
    setStep('input');
    setParsedItems([]);
    setParsedStoreName('');
    setParsedDate('');
    setParsedTotal('');
    setRawText('');
    setReceiptImageUrl(null);
    setMatchedItems([]);
  };

  const getMatchIndicator = (m: MatchedItem) => {
    if (m.confidence >= 90 && m.isConfirmed) {
      return { color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', label: t.matchConfirmed, icon: Check };
    }
    if (m.matchedCanonicalName && m.confidence >= 50) {
      return { color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', label: t.matchSuggested, icon: AlertCircle };
    }
    return { color: 'text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800', label: t.noMatch, icon: null };
  };

  return (
    <Card className="fixed bottom-24 left-6 w-[420px] max-h-[80vh] shadow-2xl border-slate-200 bg-white dark:bg-slate-900 z-[60] [dir=rtl]:left-auto [dir=rtl]:right-6 flex flex-col overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
          <CardTitle className="text-lg text-slate-900 dark:text-slate-50">
            {t.importReceipt}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 overflow-y-auto flex-1 pb-4">
        {/* Tab selection - only show in input step */}
        {step === 'input' && (
          <>
            <div className="flex gap-1 [dir=rtl]:flex-row-reverse">
              <Button
                variant={activeTab === 'paste' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('paste')}
                className="flex-1 text-xs"
              >
                <ClipboardPaste className="h-3 w-3 me-1" />
                {t.receiptTabPaste}
              </Button>
              <Button
                variant={activeTab === 'pdf' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('pdf')}
                className="flex-1 text-xs"
              >
                <FileText className="h-3 w-3 me-1" />
                {t.receiptTabPdf}
              </Button>
              <Button
                variant={activeTab === 'photo' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('photo')}
                className="flex-1 text-xs"
              >
                <Camera className="h-3 w-3 me-1" />
                {t.receiptTabPhoto}
              </Button>
            </div>

            {activeTab === 'paste' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                  {t.receiptPasteHelp}
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={t.receiptPastePlaceholder}
                  className="w-full h-40 p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  dir="rtl"
                />
                <Button
                  onClick={handlePasteSubmit}
                  disabled={loading || !pasteText.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin me-2" />{t.receiptParsing}</>
                  ) : (
                    t.receiptParseBtn
                  )}
                </Button>
              </div>
            )}

            {activeTab === 'pdf' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                  {t.receiptPdfHelp}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv,.html"
                  onChange={(e) => handleFileUpload(e, 'pdf_upload')}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin me-2" />{t.receiptParsing}</>
                  ) : (
                    <><FileText className="h-4 w-4 me-2" />{t.receiptChooseFile}</>
                  )}
                </Button>
              </div>
            )}

            {activeTab === 'photo' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                  {t.receiptPhotoHelp}
                </p>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleFileUpload(e, 'photo_ocr')}
                  className="hidden"
                />
                <Button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin me-2" />{t.receiptOcrProcessing}</>
                  ) : (
                    <><Camera className="h-4 w-4 me-2" />{t.receiptTakePhoto}</>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Matching loading state */}
        {step === 'matching' && matchingLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600 me-2" />
            <span className="text-sm text-slate-600 dark:text-slate-400">{t.matchingItems}</span>
          </div>
        )}

        {/* Parsed results - editable with matching indicators */}
        {step === 'parsed' && (
          <div className="space-y-3">
            <div className="flex gap-2 [dir=rtl]:flex-row-reverse">
              <Button variant="ghost" size="sm" onClick={handleBackToInput} className="text-xs">
                {t.receiptBackToInput}
              </Button>
            </div>

            {/* Store name */}
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1 text-right">
                {t.receiptStoreName}
              </label>
              <Input
                value={parsedStoreName}
                onChange={(e) => setParsedStoreName(e.target.value)}
                placeholder={t.receiptStoreName}
                className="text-right text-sm"
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1 text-right">
                {t.receiptDate}
              </label>
              <Input
                type="date"
                value={parsedDate}
                onChange={(e) => setParsedDate(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Items table with matching */}
            <div>
              <div className="flex items-center justify-between mb-1 [dir=rtl]:flex-row-reverse">
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {t.receiptItems} ({parsedItems.length})
                </label>
                <Button variant="ghost" size="sm" onClick={handleAddItem} className="h-6 text-xs">
                  <Plus className="h-3 w-3 me-1" />{t.add}
                </Button>
              </div>
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                {parsedItems.map((item, idx) => {
                  const match = matchedItems[idx];
                  const indicator = match ? getMatchIndicator(match) : null;
                  return (
                    <div key={idx} className={`rounded p-1.5 space-y-1 ${indicator?.bg || 'bg-slate-50 dark:bg-slate-800'}`}>
                      {/* Match indicator row */}
                      {match && match.matchedCanonicalName && (
                        <div className="flex items-center justify-between gap-1 [dir=rtl]:flex-row-reverse">
                          <div className="flex items-center gap-1 [dir=rtl]:flex-row-reverse flex-1 min-w-0">
                            {indicator?.icon && <indicator.icon className={`h-3 w-3 flex-shrink-0 ${indicator.color}`} />}
                            <span className={`text-[10px] font-medium ${indicator?.color}`}>
                              {indicator?.label}
                            </span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                              → {match.matchedCanonicalName}
                            </span>
                          </div>
                          <div className="flex gap-0.5 flex-shrink-0">
                            {!match.isConfirmed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMatchAction(idx, 'approve')}
                                className="h-5 w-5 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
                                title={t.approveMatch}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMatchAction(idx, 'reject')}
                              className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
                              title={t.rejectMatch}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {/* Item fields row */}
                      <div className="flex gap-1 items-center [dir=rtl]:flex-row-reverse">
                        <Input
                          value={item.name}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                          placeholder={t.itemName}
                          className="flex-1 text-xs h-7 text-right"
                        />
                        <Input
                          type="number"
                          value={item.quantity ?? ''}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          placeholder={t.receiptQty}
                          className="w-12 text-xs h-7 text-center"
                          step="0.01"
                        />
                        <Input
                          type="number"
                          value={item.totalPrice ?? ''}
                          onChange={(e) => handleItemChange(idx, 'totalPrice', e.target.value)}
                          placeholder="₪"
                          className="w-16 text-xs h-7 text-center"
                          step="0.01"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(idx)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 flex-shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {parsedItems.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">{t.receiptNoItemsFound}</p>
                )}
              </div>
            </div>

            {/* Total */}
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1 text-right">
                {t.receiptTotal} (₪)
              </label>
              <Input
                type="number"
                value={parsedTotal}
                onChange={(e) => setParsedTotal(e.target.value)}
                placeholder="0"
                className="text-right text-sm"
                step="0.01"
              />
            </div>

            {/* Link to list */}
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1 text-right">
                {t.receiptLinkToList}
              </label>
              <select
                value={linkedListId || ''}
                onChange={(e) => setLinkedListId(e.target.value || null)}
                className="w-full p-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-right"
                dir="rtl"
              >
                <option value="">{t.receiptStandalone}</option>
                {completedLists.map(list => (
                  <option key={list.id} value={list.id}>
                    {list.title} {list.completed_at ? `(${new Date(list.completed_at).toLocaleDateString('he-IL')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Save */}
            <Button
              onClick={handleSave}
              disabled={saving || parsedItems.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin me-2" />{t.receiptSaving}</>
              ) : (
                t.receiptSaveBtn
              )}
            </Button>
          </div>
        )}

        {/* Saving state */}
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
