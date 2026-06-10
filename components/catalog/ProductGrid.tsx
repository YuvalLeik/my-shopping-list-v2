'use client';

import { Plus } from 'lucide-react';
import { CatalogEntry } from '@/lib/catalogView';
import { GroceryItem } from '@/lib/groceryItems';
import ProductCard from './ProductCard';
import { t } from '@/lib/translations';

interface ProductGridProps {
  entries: CatalogEntry[];
  /** Map from normalized item name to the grocery item in the current list */
  inListByName: Map<string, GroceryItem>;
  searchTerm: string;
  busyNames: Set<string>;
  onAdd: (entry: CatalogEntry) => void;
  onQuantityChange: (item: GroceryItem, newQuantity: number) => void;
  onRemove: (item: GroceryItem) => void;
  onAddNewItem: (prefillName: string) => void;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function ProductGrid({
  entries,
  inListByName,
  searchTerm,
  busyNames,
  onAdd,
  onQuantityChange,
  onRemove,
  onAddNewItem,
}: ProductGridProps) {
  const trimmedSearch = searchTerm.trim();
  const exactMatchExists = entries.some(
    (e) => normalize(e.name) === normalize(trimmedSearch)
  );

  if (entries.length === 0 && !trimmedSearch) {
    return (
      <div className="py-16 text-center text-slate-400 dark:text-slate-500">
        <div className="text-5xl mb-3">🛒</div>
        <p className="text-sm">{t.catalogEmpty}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
      {/* "Add new item" card when searching for something not in the catalog */}
      {trimmedSearch && !exactMatchExists && (
        <button
          type="button"
          onClick={() => onAddNewItem(trimmedSearch)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/30 p-4 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors min-h-[180px]"
        >
          <Plus className="size-8" />
          <span className="text-sm font-medium text-center leading-snug">
            {t.addNewItemNamed(trimmedSearch)}
          </span>
        </button>
      )}

      {entries.map((entry) => (
        <ProductCard
          key={entry.name}
          entry={entry}
          inListItem={inListByName.get(normalize(entry.name))}
          busy={busyNames.has(normalize(entry.name))}
          onAdd={onAdd}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      ))}

      {entries.length === 0 && trimmedSearch && (
        <div className="col-span-full py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          {t.noCatalogResults}
        </div>
      )}
    </div>
  );
}
