import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Maximize, Minimize } from 'lucide-react';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };

const doc = () => document as FullscreenDocument;

export function isFullscreen() {
  return Boolean(doc().fullscreenElement ?? doc().webkitFullscreenElement);
}

export function fullscreenSupported() {
  if (typeof document === 'undefined' || Capacitor.isNativePlatform()) return false;
  const root = document.documentElement as FullscreenElement;
  return Boolean(root.requestFullscreen ?? root.webkitRequestFullscreen);
}

export async function enterFullscreen() {
  if (!fullscreenSupported() || isFullscreen()) return;
  const root = document.documentElement as FullscreenElement;
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else await root.webkitRequestFullscreen?.();
    // Orientation lock only works while fullscreen, and not on every browser.
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined);
  } catch {
    // The browser refused (no user gesture, iOS Safari, embedded preview). The game still works windowed.
  }
}

export async function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // Ignore: the user can still leave with the system back gesture.
  }
}

/**
 * Tracks fullscreen state and, on touch devices, enters fullscreen on the first tap.
 * Browsers only allow fullscreen from a user gesture, so it cannot happen on page load.
 * If the player leaves fullscreen, the game does not force it again; the toggle stays available.
 */
export function useFullscreen() {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && isFullscreen());
  const supported = fullscreenSupported();

  useEffect(() => {
    const update = () => setActive(isFullscreen());
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onFirstTouch = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      window.removeEventListener('pointerup', onFirstTouch, true);
      void enterFullscreen();
    };
    window.addEventListener('pointerup', onFirstTouch, true);
    return () => window.removeEventListener('pointerup', onFirstTouch, true);
  }, [supported]);

  const toggle = useCallback(() => {
    void (isFullscreen() ? exitFullscreen() : enterFullscreen());
  }, []);

  return { supported, active, toggle };
}

export type FullscreenState = ReturnType<typeof useFullscreen>;

export function FullscreenToggle({ fullscreen }: { fullscreen: FullscreenState }) {
  if (!fullscreen.supported) return null;
  return <button type="button" className="fullscreen-toggle" onClick={fullscreen.toggle} aria-pressed={fullscreen.active}>{fullscreen.active ? <Minimize size={14} /> : <Maximize size={14} />}{fullscreen.active ? 'ЖИЖИГРҮҮЛЭХ' : 'БҮТЭН ДЭЛГЭЦ'}</button>;
}

