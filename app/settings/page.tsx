'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { SettingsContent } from '@/components/SettingsContent';
import { fetchLocalUsers, LocalUser } from '@/lib/localUsers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/translations';

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsers() {
      try {
        const loadedUsers = await fetchLocalUsers();
        setUsers(loadedUsers);

        const userIdFromUrl = searchParams.get('userId');

        if (userIdFromUrl && loadedUsers.find(u => u.id === userIdFromUrl)) {
          setActiveUserId(userIdFromUrl);
          localStorage.setItem('activeUserId', userIdFromUrl);
        } else {
          const storedUserId = localStorage.getItem('activeUserId');
          if (storedUserId && loadedUsers.find(u => u.id === storedUserId)) {
            setActiveUserId(storedUserId);
          } else if (loadedUsers.length > 0) {
            setActiveUserId(loadedUsers[0].id);
            localStorage.setItem('activeUserId', loadedUsers[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load users:', error);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t.itemMatchSettings}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {activeUserId && users.find(u => u.id === activeUserId)?.name
                  ? `משתמש: ${users.find(u => u.id === activeUserId)?.name}`
                  : 'בחר משתמש'}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="flex items-center gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              {t.settingsBackToLists}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-5xl">
        {activeUserId ? (
          <SettingsContent userId={activeUserId} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>יש לבחור משתמש</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-slate-400">
                אנא בחר משתמש כדי לראות את ההגדרות
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">טוען...</p>
        </div>
      </div>
    }>
      <SettingsPageContent />
    </Suspense>
  );
}
