'use client';

import { useState, useRef } from 'react';
import { Plus, Upload, Loader2 } from 'lucide-react';
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

interface AddItemFormProps {
  onAddItem: (name: string, category: string, quantity: number, imageUrl: string | null) => Promise<void>;
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadImage = async () => {
    if (!imageFile) return;

    try {
      setUploadingImage(true);
      const imageUrl = await uploadItemImage(imageFile);
      setImagePreview(imageUrl);
      // Image is now uploaded, we'll use the URL when submitting
    } catch (error) {
      console.error('Failed to upload image:', error);
      // Continue without image - user can still add item
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let imageUrl: string | null = null;
    if (imageFile && imagePreview && !imagePreview.startsWith('data:')) {
      // Already uploaded
      imageUrl = imagePreview;
    } else if (imageFile) {
      // Upload now
      try {
        imageUrl = await uploadItemImage(imageFile);
      } catch (error) {
        console.error('Failed to upload image:', error);
        // Continue without image
      }
    }

    await onAddItem(name.trim(), category, quantity, imageUrl);
    
    // Reset form
    setName('');
    setCategory('ללא קטגוריה');
    setQuantity(1);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="flex-1"
                disabled={adding || uploadingImage}
              />
              {imageFile && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUploadImage}
                  disabled={uploadingImage || adding}
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin me-2" />
                      מעלה...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 me-2" />
                      הוסף תמונה
                    </>
                  )}
                </Button>
              )}
            </div>
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
            disabled={!isFormValid || adding}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                מוסיף...
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
