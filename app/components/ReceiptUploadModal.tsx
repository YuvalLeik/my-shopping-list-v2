"use client";

import { useState, useRef } from "react";
import { GroceryItem } from "../types";
import { supabase } from "@/lib/supabase";
import { getUserIdSync } from "@/lib/database";
import { savePriceMemory } from "@/lib/price-memory-local";

interface ReceiptUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GroceryItem[];
  listId: string | null;
  onPricesApplied: () => void;
}

interface ExtractedItem {
  name: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  matched_item_id: string | null;
}

type Step = "upload" | "processing" | "review" | "error";

function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function fuzzyMatch(extractedName: string, listItems: GroceryItem[]): string | null {
  const norm = normalizeName(extractedName);
  // Exact match
  let m = listItems.find((i) => normalizeName(i.name) === norm);
  if (m) return m.id;
  // Substring either way
  m = listItems.find(
    (i) => normalizeName(i.name).includes(norm) || norm.includes(normalizeName(i.name))
  );
  if (m) return m.id;
  // Word overlap
  const words = norm.split(" ").filter((w) => w.length >= 2);
  for (const item of listItems) {
    const itemNorm = normalizeName(item.name);
    if (words.some((w) => itemNorm.includes(w))) return item.id;
  }
  return null;
}

export default function ReceiptUploadModal({
  isOpen,
  onClose,
  items,
  listId,
  onPricesApplied,
}: ReceiptUploadModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vendor, setVendor] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStep("upload");
    setPreviewUrl(null);
    setError(null);
    setVendor("");
    setTotal(null);
    setExtracted([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("יש לבחור קובץ תמונה");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("הקובץ גדול מ-8MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setStep("processing");
      setError(null);

      try {
        const res = await fetch("/api/receipts/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_base64: dataUrl,
            local_user_id: getUserIdSync(),
            list_id: listId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "OCR failed" }));
          throw new Error(err.error || "OCR failed");
        }

        const data = await res.json();
        setVendor(data.vendor_name || "");
        setTotal(typeof data.total === "number" ? data.total : null);

        const ex: ExtractedItem[] = (data.items || []).map((i: any) => ({
          name: String(i.name || ""),
          quantity: typeof i.quantity === "number" ? i.quantity : 1,
          unit_price: typeof i.unit_price === "number" ? i.unit_price : null,
          line_total: typeof i.line_total === "number" ? i.line_total : null,
          matched_item_id: fuzzyMatch(String(i.name || ""), items),
        }));
        setExtracted(ex);
        setStep("review");
      } catch (e: any) {
        setError(e.message || "OCR failed");
        setStep("error");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const updateExtracted = (idx: number, patch: Partial<ExtractedItem>) => {
    setExtracted((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };

  const handleApply = async () => {
    if (!vendor.trim()) {
      setError("שם החנות חובה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let listTotal = 0;
      // Apply each extracted line
      for (const ex of extracted) {
        if (!ex.unit_price || ex.unit_price <= 0) continue;
        listTotal += (ex.line_total ?? ex.unit_price * ex.quantity) || 0;

        // Save to price memory (use matched name if matched, otherwise extracted name)
        const matchedItem = ex.matched_item_id
          ? items.find((i) => i.id === ex.matched_item_id)
          : null;
        const memoryName = matchedItem?.name || ex.name;
        await savePriceMemory(vendor.trim(), memoryName, ex.unit_price);

        // If matched, update the grocery_items row
        if (ex.matched_item_id) {
          await supabase
            .from("grocery_items")
            .update({
              unit_price: ex.unit_price,
              line_total: ex.line_total ?? ex.unit_price * ex.quantity,
              vendor_name: vendor.trim(),
            })
            .eq("id", ex.matched_item_id);
        }
      }

      // Update list total
      if (listId && listTotal > 0) {
        await supabase
          .from("grocery_lists")
          .update({ total_cost: total ?? listTotal })
          .eq("id", listId);
      }

      onPricesApplied();
      handleClose();
    } catch (e: any) {
      setError(e.message || "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">העלאת קבלה (OCR)</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === "upload" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                צלם או העלה תמונה של קבלה. Gemini ינתח אותה ויחלץ אוטומטית את שם החנות, הפריטים והמחירים.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-8 text-center hover:bg-blue-100 transition-colors"
              >
                <div className="text-4xl mb-2">📸</div>
                <div className="text-sm font-medium text-blue-700">
                  לחץ לבחירת תמונה
                </div>
                <div className="text-xs text-blue-500 mt-1">JPG, PNG עד 8MB</div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          )}

          {step === "processing" && (
            <div className="py-8 text-center">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="receipt"
                  className="mx-auto mb-4 max-h-48 rounded-lg shadow"
                />
              )}
              <div className="text-sm font-medium text-gray-700">
                מנתח את הקבלה...
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Gemini קורא את הטקסט ומחלץ פריטים. זה לוקח 5-15 שניות.
              </div>
              <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div className="flex gap-2 items-start">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="receipt"
                    className="h-24 rounded-lg shadow flex-shrink-0"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      שם החנות
                    </label>
                    <input
                      type="text"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="שופרסל, רמי לוי..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  {total !== null && (
                    <div className="text-sm">
                      <span className="text-gray-500">סה״כ מהקבלה: </span>
                      <span className="font-bold text-green-700">
                        {total.toFixed(2)}₪
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  פריטים שזוהו ({extracted.length})
                </h3>
                <div className="space-y-2">
                  {extracted.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-lg">
                      לא זוהו פריטים
                    </div>
                  ) : (
                    extracted.map((ex, idx) => {
                      const matched = ex.matched_item_id
                        ? items.find((i) => i.id === ex.matched_item_id)
                        : null;
                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border p-3 ${
                            matched
                              ? "border-green-200 bg-green-50"
                              : "border-gray-200 bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {ex.name}
                              </div>
                              {matched && (
                                <div className="text-xs text-green-700">
                                  ✓ תואם ל: {matched.name}
                                </div>
                              )}
                            </div>
                            <select
                              value={ex.matched_item_id || ""}
                              onChange={(e) =>
                                updateExtracted(idx, {
                                  matched_item_id: e.target.value || null,
                                })
                              }
                              className="rounded border border-gray-300 px-2 py-1 text-xs bg-white"
                            >
                              <option value="">לא מקושר</option>
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <label className="text-gray-500">כמות:</label>
                            <input
                              type="number"
                              step="0.01"
                              value={ex.quantity}
                              onChange={(e) =>
                                updateExtracted(idx, {
                                  quantity: parseFloat(e.target.value) || 1,
                                })
                              }
                              className="w-16 rounded border border-gray-300 px-1.5 py-1 text-left"
                              dir="ltr"
                            />
                            <label className="text-gray-500 mr-2">מחיר:</label>
                            <input
                              type="number"
                              step="0.01"
                              value={ex.unit_price ?? ""}
                              onChange={(e) =>
                                updateExtracted(idx, {
                                  unit_price: parseFloat(e.target.value) || null,
                                })
                              }
                              className="w-20 rounded border border-gray-300 px-1.5 py-1 text-left"
                              dir="ltr"
                            />
                            <span className="text-gray-500">₪</span>
                            {ex.line_total !== null && (
                              <span className="mr-auto text-gray-500">
                                = {ex.line_total.toFixed(2)}₪
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="py-8 text-center">
              <div className="text-4xl mb-2">⚠️</div>
              <div className="text-sm font-medium text-gray-700 mb-3">
                לא הצלחנו לנתח את הקבלה
              </div>
              <button
                onClick={() => setStep("upload")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                נסה שוב
              </button>
            </div>
          )}
        </div>

        {step === "review" && (
          <div className="p-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              בטל
            </button>
            <button
              onClick={handleApply}
              disabled={saving || !vendor.trim()}
              className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "שומר..." : "החל מחירים"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
