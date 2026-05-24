"use client";

import { useState, useEffect } from "react";
import { GroceryItem } from "../types";
import {
  savePriceMemory,
  getPriceSuggestionsForVendor,
  getKnownVendors,
} from "@/lib/price-memory-local";
import { supabase } from "@/lib/supabase";

interface PriceEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GroceryItem[];
  listId: string | null;
  onPricesApplied: () => void;
}

interface ItemPrice {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: string;
}

export default function PriceEntryModal({
  isOpen,
  onClose,
  items,
  listId,
  onPricesApplied,
}: PriceEntryModalProps) {
  const [vendorName, setVendorName] = useState("");
  const [knownVendors, setKnownVendors] = useState<string[]>([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [itemPrices, setItemPrices] = useState<ItemPrice[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItemPrices(
        items.map((item) => ({
          item_id: item.id,
          item_name: item.name,
          quantity: item.quantity,
          unit_price: "",
        }))
      );
      setVendorName("");
      setError(null);
      getKnownVendors().then(setKnownVendors);
    }
  }, [isOpen, items]);

  useEffect(() => {
    if (vendorName && itemPrices.length > 0) {
      const names = itemPrices.map((ip) => ip.item_name);
      getPriceSuggestionsForVendor(vendorName, names).then(setSuggestions);
    } else {
      setSuggestions({});
    }
  }, [vendorName, itemPrices.length]);

  if (!isOpen) return null;

  const filteredVendors = knownVendors.filter((v) =>
    v.toLowerCase().includes(vendorName.toLowerCase())
  );

  const handlePriceChange = (itemId: string, value: string) => {
    setItemPrices((prev) =>
      prev.map((ip) => (ip.item_id === itemId ? { ...ip, unit_price: value } : ip))
    );
  };

  const handleUseSuggestion = (itemId: string, itemName: string) => {
    const price = suggestions[itemName];
    if (price !== undefined) {
      setItemPrices((prev) =>
        prev.map((ip) =>
          ip.item_id === itemId ? { ...ip, unit_price: price.toFixed(2) } : ip
        )
      );
    }
  };

  const totalSum = itemPrices.reduce((sum, ip) => {
    const p = parseFloat(ip.unit_price);
    return sum + (isNaN(p) ? 0 : p * ip.quantity);
  }, 0);

  const handleSave = async () => {
    if (!vendorName.trim()) {
      setError("שם החנות הוא שדה חובה");
      return;
    }
    const pricedItems = itemPrices.filter((ip) => {
      const p = parseFloat(ip.unit_price);
      return !isNaN(p) && p > 0;
    });
    if (pricedItems.length === 0) {
      setError("הכנס לפחות מחיר אחד");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const ip of pricedItems) {
        const p = parseFloat(ip.unit_price);
        await savePriceMemory(vendorName.trim(), ip.item_name, p);
      }
      if (listId && totalSum > 0) {
        await supabase
          .from("grocery_lists")
          .update({ total_cost: totalSum })
          .eq("id", listId);
      }
      for (const ip of pricedItems) {
        const p = parseFloat(ip.unit_price);
        await supabase
          .from("grocery_items")
          .update({
            unit_price: p,
            line_total: p * ip.quantity,
            vendor_name: vendorName.trim(),
          })
          .eq("id", ip.item_id);
      }
      onPricesApplied();
      onClose();
    } catch (err: any) {
      setError(err.message || "שגיאה בשמירת המחירים");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">הוסף מחירים</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              שם החנות *
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => {
                setVendorName(e.target.value);
                setShowVendorDropdown(true);
              }}
              onFocus={() => setShowVendorDropdown(true)}
              onBlur={() => setTimeout(() => setShowVendorDropdown(false), 150)}
              placeholder="שופרסל, רמי לוי..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {showVendorDropdown && filteredVendors.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                {filteredVendors.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={() => {
                      setVendorName(v);
                      setShowVendorDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-right text-sm text-gray-900 hover:bg-gray-50"
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              מחיר לפריט
            </h3>
            <div className="space-y-2">
              {itemPrices.map((ip) => {
                const suggestion = suggestions[ip.item_name];
                const p = parseFloat(ip.unit_price);
                const lineTotal = isNaN(p) ? null : p * ip.quantity;
                return (
                  <div
                    key={ip.item_id}
                    className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {ip.item_name}
                      </div>
                      {ip.quantity > 1 && (
                        <div className="text-xs text-gray-500">
                          כמות: {ip.quantity}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {suggestion !== undefined && (
                        <button
                          onClick={() =>
                            handleUseSuggestion(ip.item_id, ip.item_name)
                          }
                          className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          title="מחיר מהפעם הקודמת"
                        >
                          {suggestion.toFixed(2)}₪
                        </button>
                      )}
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ip.unit_price}
                          onChange={(e) =>
                            handlePriceChange(ip.item_id, e.target.value)
                          }
                          placeholder="0.00"
                          className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-left focus:border-blue-500 focus:outline-none"
                          dir="ltr"
                        />
                        <span className="text-sm text-gray-500">₪</span>
                      </div>
                      {lineTotal !== null && ip.quantity > 1 && (
                        <span className="text-xs text-gray-500 w-14 text-left">
                          = {lineTotal.toFixed(2)}₪
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {totalSum > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-200 p-3">
              <span className="text-sm font-semibold text-blue-900">
                סה״כ כולל
              </span>
              <span className="text-lg font-bold text-blue-700">
                {totalSum.toFixed(2)}₪
              </span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            בטל
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !vendorName.trim()}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור מחירים"}
          </button>
        </div>
      </div>
    </div>
  );
}
