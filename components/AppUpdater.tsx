'use client';

import { useEffect } from 'react';

/**
 * Keeps the installed home-screen app (Android & iPhone) on the latest
 * version: checks for a new service worker whenever the app returns to the
 * foreground, and reloads once when the new version takes control.
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
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  return null;
}
