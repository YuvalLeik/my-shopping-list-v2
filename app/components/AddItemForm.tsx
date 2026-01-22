'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { uploadItemImage } from '@/lib/storage';
import { updateGroceryItem } from '@/lib/groceryItems';

interface AddItemFormProps {
  onAddItem: (name: string, category: string, quantity: number) => Promise<string>; // Returns item id
  adding: boolean;
}

const CATEGORIES = [
  'ללא קטגוריה',
  'מזווה',
  'ירקות ופירות',
  'קפואים',
  'מוצרי חלב וביצים',
  'בשר ודגים',
  'משקאות',
  'מוצרי ניקיון והיגיינה',
  'אחר',
];

export function AddItemForm({ onAddItem, adding }: AddItemFormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('ללא קטגוריה');
  const [quantity, setQuantity] = useState(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL on unmount or when image changes
  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke previous URL if exists
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
      
      setImageFile(file);
      // Create preview using URL.createObjectURL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      // Step 1: Insert item into Supabase and get id
      const itemId = await onAddItem(name.trim(), category, quantity);
      
      // Step 2: If image file exists, upload it and update item
      if (imageFile && itemId) {
        setUploadingImage(true);
        try {
          const { publicUrl } = await uploadItemImage(imageFile, itemId);
          
          // Step 3: Update the item with image_url
          await updateGroceryItem(itemId, { image_url: publicUrl });
        } catch (imageError) {
          console.error('Failed to upload image:', imageError);
          // Continue - item was created successfully, just without image
        } finally {
          setUploadingImage(false);
        }
      }
      
      // Reset form
      setName('');
      setCategory('ללא קטגוריה');
      setQuantity(1);
      
      // Cleanup preview URL
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to add item:', error);
      // Error handling is done in parent component
    }
  };

  const isFormValid = name.trim().length > 0;

  return (
    <Card className="shadow-md border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">הוסף פריט חדש</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              שם הפריט (חובה)
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הפריט (חובה)"
              className="w-full"
              disabled={adding}
            />
            {!isFormValid && name.length === 0 && (
              <p className="text-xs text-red-600 mt-1">שם הפריט חובה</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              קטגוריה
            </label>
            <Select value={category} onValueChange={setCategory} disabled={adding}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              תמונה (אופציונלי)
            </label>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="w-full"
              disabled={adding || uploadingImage}
            />
            {imagePreview && (
              <div className="mt-2">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-16 h-16 object-cover rounded border border-slate-200"
                />
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={!isFormValid || adding || uploadingImage}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {adding || uploadingImage ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {uploadingImage ? 'מעלה תמונה...' : 'מוסיף...'}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 me-2" />
                הוסף פריט
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
