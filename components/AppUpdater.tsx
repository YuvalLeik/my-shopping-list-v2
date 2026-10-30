'use client';

import { useEffect } from 'react';

/** While the app stays open, also look for a new version this often. */
const PERIODIC_CHECK_MS = 30 * 60 * 1000;

/**
 * Keeps the installed home-screen app (Android & iPhone) on the latest
 * version: checks for a new service worker whenever the app returns to the
 * foreground, and reloads once when the new version takes control.
 * iOS doesn't reliably fire visibilitychange when a standalone app resumes,
 * so pageshow/focus and a periodic check cover it too.
 */
export function AppUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    const onControllerChange = () => {
      // First install also fires this; only reload when replacing an old version.
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('pageshow', checkForUpdate);
    window.addEventListener('focus', checkForUpdate);
    const interval = window.setInterval(checkForUpdate, PERIODIC_CHECK_MS);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
      window.removeEventListener('pageshow', checkForUpdate);
      window.removeEventListener('focus', checkForUpdate);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
