"use client";

import { useState } from "react";
import { GroceryItem, CATEGORY_TRANSLATIONS, Category } from "../types";

interface ItemCardProps {
  item: GroceryItem;
  onTogglePurchased: (id: string) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  Produce: "border-l-green-500",
  Dairy: "border-l-blue-400",
  Meat: "border-l-red-500",
  Fish: "border-l-cyan-500",
  Bakery: "border-l-amber-500",
  Pantry: "border-l-yellow-600",
  Frozen: "border-l-indigo-400",
  Drinks: "border-l-purple-500",
  Other: "border-l-gray-400",
  "": "border-l-transparent",
};

export default function ItemCard({
  item,
  onTogglePurchased,
  onUpdateQuantity,
  onDelete,
}: ItemCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = () => {
    setIsDeleting(true);
    setTimeout(() => onDelete(item.id), 200);
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-l-4 border border-gray-100 bg-white p-3 sm:p-4 shadow-sm transition-all duration-200 ${
        CATEGORY_BORDER_COLORS[item.category]
      } ${item.purchased ? "opacity-60" : "hover:shadow-md"} ${
        isDeleting ? "opacity-0 -translate-x-4 scale-95" : ""
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onTogglePurchased(item.id)}
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
          item.purchased
            ? "border-green-500 bg-green-500 animate-check-bounce"
            : "border-gray-300 hover:border-green-400"
        }`}
        aria-label={item.purchased ? "סמן כלא נרכש" : "סמן כנרכש"}
      >
        {item.purchased && (
          <svg
            className="h-3.5 w-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>

      {/* Image */}
      {item.image && (
        <img
          src={item.image}
          alt={item.name}
          className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
        />
      )}

      {/* Name + Category */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm sm:text-base font-medium truncate ${
            item.purchased ? "text-gray-400 line-through" : "text-gray-900"
          }`}
        >
          {item.name}
        </div>
        {item.category && (
          <div className="text-xs text-gray-400 mt-0.5">
            {CATEGORY_TRANSLATIONS[item.category as Category]}
          </div>
        )}
        {item.unit_price != null && item.unit_price > 0 && (
          <div className="text-xs font-medium text-green-600 mt-0.5">
            {item.unit_price.toFixed(2)}₪
            {item.quantity > 1 && item.line_total != null && (
              <span className="text-gray-400 font-normal">
                {" "}(סה״כ {item.line_total.toFixed(2)}₪)
              </span>
            )}
            {item.vendor_name && (
              <span className="text-gray-400 font-normal"> · {item.vendor_name}</span>
            )}
          </div>
        )}
      </div>

      {/* Quantity + Controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onUpdateQuantity(item.id, -1)}
          disabled={item.quantity <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 text-sm"
          aria-label="הקטן כמות"
        >
          −
        </button>
        <span className="min-w-[1.5rem] text-center text-sm font-semibold text-gray-800">
          {item.quantity}
        </span>
        <button
          onClick={() => onUpdateQuantity(item.id, 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 text-sm"
          aria-label="הגדל כמות"
        >
          +
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:text-red-500 hover:bg-red-50"
        aria-label="מחק פריט"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
