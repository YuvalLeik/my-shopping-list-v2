'use client';

import { useState } from 'react';
import { Trash2, Plus, Minus, Loader2 } from 'lucide-react';
import { ShoppingItem, updateItem, deleteItem } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ItemsListProps {
  items: ShoppingItem[];
  loading: boolean;
  onItemUpdate: () => void;
  onItemDelete: (itemId: string) => void;
  onMarkCompleted?: () => void;
  isCompleted?: boolean;
}

const SORT_OPTIONS = [
  { value: 'not_purchased', label: 'לא נרכש קודם' },
  { value: 'category', label: 'לפי קטגוריה' },
  { value: 'name', label: 'לפי שם' },
  { value: 'quantity', label: 'לפי כמות' },
];

export function ItemsList({ items, loading, onItemUpdate, onItemDelete, onMarkCompleted, isCompleted }: ItemsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('not_purchased');
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const getItemText = (count: number): string => {
    return count === 1 ? 'פריט' : 'פריטים';
  };

  const handleTogglePurchased = async (item: ShoppingItem) => {
    setUpdatingItemId(item.id);
    try {
      await updateItem(item.id, { purchased: !item.purchased });
      onItemUpdate();
    } catch (error) {
      console.error('Failed to update item:', error);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleQuantityChange = async (item: ShoppingItem, delta: number) => {
    const newQuantity = Math.max(1, item.quantity + delta);
    if (newQuantity === item.quantity) return;

    setUpdatingItemId(item.id);
    try {
      await updateItem(item.id, { quantity: newQuantity });
      onItemUpdate();
    } catch (error) {
      console.error('Failed to update quantity:', error);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingItemId(itemId);
    try {
      await deleteItem(itemId);
      onItemDelete(itemId);
    } catch (error) {
      console.error('Failed to delete item:', error);
    } finally {
      setDeletingItemId(null);
    }
  };

  // Filter and sort items
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'not_purchased':
        if (a.purchased !== b.purchased) {
          return a.purchased ? 1 : -1;
        }
        return 0;
      case 'category':
        return a.category.localeCompare(b.category);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'quantity':
        return b.quantity - a.quantity;
      default:
        return 0;
    }
  });

  return (
    <Card className="shadow-md border-slate-200 bg-white">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-lg text-slate-900">
            הרשימה שלך ({items.length} {getItemText(items.length)})
          </CardTitle>
        </div>

        {/* Search + Sort + Complete */}
        <div className="flex gap-4 items-end mb-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-700 mb-2 block">חיפוש</label>
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפש פריטים..."
              className="w-full"
            />
          </div>
          <div className="w-48">
            <label className="text-sm font-medium text-slate-700 mb-2 block">מיון לפי</label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {onMarkCompleted && (
            <Button
              onClick={onMarkCompleted}
              disabled={isCompleted}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              סמן רשימה כהושלמה
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin me-2" />
            <span>טוען פריטים...</span>
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="font-medium mb-1">אין פריטים</p>
            <p className="text-sm">הוסף פריטים לרשימה</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sortedItems.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors ${
                  item.purchased ? 'opacity-60' : ''
                }`}
              >
                <Checkbox
                  checked={item.purchased}
                  onCheckedChange={() => handleTogglePurchased(item)}
                  disabled={updatingItemId === item.id}
                  className="flex-shrink-0"
                />
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-12 h-12 object-cover rounded border border-slate-200 flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-bold text-slate-900 ${
                      item.purchased ? 'line-through opacity-60' : ''
                    }`}
                  >
                    {item.name}
                  </p>
                  <span className="text-xs text-slate-500 mt-1 block">{item.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuantityChange(item, -1)}
                    disabled={item.quantity <= 1 || updatingItemId === item.id}
                    className="h-8 w-8 p-0"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-slate-700 w-8 text-center">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuantityChange(item, 1)}
                    disabled={updatingItemId === item.id}
                    className="h-8 w-8 p-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingItemId === item.id}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                >
                  {deletingItemId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'מחק'
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
